package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.application.port.CandidateCvRepository;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvVersion;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Service
public class CvService {
    private static final long MAX_SIZE_BYTES = 10 * 1024 * 1024;
    private static final String PDF_MIME_TYPE = "application/pdf";
    private final CandidateCvRepository cvs;
    private final ObjectStorage storage;
    private final OutboxEventRepository outbox;
    private final String storageBucket;

    public CvService(CandidateCvRepository cvs, ObjectStorage storage) {
        this(cvs, storage, event -> { }, "smart-recruitment-cv");
    }

    @Autowired
    public CvService(CandidateCvRepository cvs, ObjectStorage storage, OutboxEventRepository outbox,
                     @Value("${core.storage.bucket:smart-recruitment-cv}") String storageBucket) {
        this.cvs = cvs;
        this.storage = storage;
        this.outbox = outbox;
        this.storageBucket = storageBucket;
    }

    @Transactional
    public CandidateCv upload(UUID candidateUserId, String requestedTitle, MultipartFile file) {
        return upload(candidateUserId, requestedTitle, file, UUID.randomUUID());
    }

    @Transactional
    public CandidateCv upload(UUID candidateUserId, String requestedTitle, MultipartFile file, UUID correlationId) {
        validate(file);
        String filename = safeFilename(file.getOriginalFilename());
        String title = normalizeTitle(requestedTitle, filename);
        String objectKey = "candidates/" + candidateUserId + "/" + UUID.randomUUID() + ".pdf";
        String sha256 = sha256(file);
        UUID versionId = UUID.randomUUID();
        CvVersion version = CvVersion.uploaded(versionId, storageBucket, objectKey, filename,
                file.getSize(), sha256, candidateUserId);
        CandidateCv candidateCv = CandidateCv.uploaded(candidateUserId, title, version);

        try (InputStream input = file.getInputStream()) {
            storage.put(objectKey, input, file.getSize(), PDF_MIME_TYPE);
        } catch (IOException | RuntimeException exception) {
            safeDelete(objectKey);
            if (exception instanceof CvStorageException storageException) throw storageException;
            throw new CvStorageException(exception);
        }

        try {
            CandidateCv saved = cvs.insert(candidateCv);
            outbox.append(CvUploadedEvent.from(saved, correlationId,
                    OffsetDateTime.now(ZoneOffset.UTC)));
            return saved;
        } catch (RuntimeException exception) {
            safeDelete(objectKey);
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public List<CandidateCv> listMine(UUID candidateUserId) {
        return cvs.findByCandidateUserId(candidateUserId);
    }

    @Transactional(readOnly = true)
    public CandidateCv getMine(UUID candidateUserId, UUID cvId) {
        return cvs.findByPublicId(candidateUserId, cvId).orElseThrow(CandidateCvNotFoundException::new);
    }

    private static void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new CvUploadException("CV file must not be empty");
        if (file.getSize() > MAX_SIZE_BYTES) throw new CvUploadException("CV file must not exceed 10 MiB");
        if (!PDF_MIME_TYPE.equalsIgnoreCase(file.getContentType())) {
            throw new CvUploadException("CV file must be a PDF");
        }
        try (InputStream input = file.getInputStream()) {
            byte[] signature = input.readNBytes(5);
            if (signature.length < 5 || signature[0] != '%' || signature[1] != 'P'
                    || signature[2] != 'D' || signature[3] != 'F' || signature[4] != '-') {
                throw new CvUploadException("CV file is not a valid PDF");
            }
        } catch (IOException exception) {
            throw new CvUploadException("CV file could not be read");
        }
    }

    private static String sha256(MultipartFile file) {
        try (InputStream input = file.getInputStream()) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            input.transferTo(new java.io.OutputStream() {
                @Override
                public void write(int value) {
                    digest.update((byte) value);
                }

                @Override
                public void write(byte[] bytes, int offset, int length) {
                    digest.update(bytes, offset, length);
                }
            });
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new CvUploadException("CV checksum could not be calculated");
        }
    }

    private static String safeFilename(String originalFilename) {
        String filename = originalFilename == null ? "cv.pdf" : originalFilename.replace('\\', '/');
        int slash = filename.lastIndexOf('/');
        filename = slash >= 0 ? filename.substring(slash + 1) : filename;
        if (filename.isBlank()) return "cv.pdf";
        return filename.length() > 255 ? filename.substring(0, 255) : filename;
    }

    private static String normalizeTitle(String requestedTitle, String filename) {
        String title = requestedTitle == null || requestedTitle.isBlank() ? filename : requestedTitle.trim();
        if (title.toLowerCase().endsWith(".pdf")) title = title.substring(0, title.length() - 4).trim();
        if (title.isBlank()) throw new CvUploadException("CV title must not be blank");
        if (title.length() > 160) throw new CvUploadException("CV title is too long");
        return title;
    }

    private void safeDelete(String objectKey) {
        try {
            storage.delete(objectKey);
        } catch (RuntimeException ignored) {
            // The original failure is safer to expose than storage cleanup details.
        }
    }
}
