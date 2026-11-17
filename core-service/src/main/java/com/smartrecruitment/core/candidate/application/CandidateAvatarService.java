package com.smartrecruitment.core.candidate.application;

import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.shared.application.port.ObjectStorage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

@Service
public class CandidateAvatarService {
    private static final String PREFIX = "/api/v2/candidates/me/avatar/";
    private final CandidateProfileService profiles;
    private final ObjectStorage storage;
    private final String bucket;

    public CandidateAvatarService(CandidateProfileService profiles, ObjectStorage storage,
                                  @Value("${core.storage.bucket:smart-recruitment-cv}") String bucket) {
        this.profiles = profiles;
        this.storage = storage;
        this.bucket = bucket;
    }

    @Transactional
    public CandidateProfile upload(Long userId, long version, MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > 2 * 1024 * 1024) {
            throw new IllegalArgumentException("Ảnh phải có dung lượng không quá 2 MB.");
        }
        byte[] png = normalize(file);
        CandidateProfile current = profiles.getMine(userId);
        if (current.version() != version) throw new CandidateProfileConflictException();
        String id = UUID.randomUUID().toString();
        String key = key(userId, id);
        storage.put(key, new ByteArrayInputStream(png), png.length, "image/png");
        try {
            CandidateProfile updated = profiles.putMine(userId, current.displayName(), current.headline(), current.locationText(),
                    current.visibility(), version, current.phoneNumber(), current.contactEmail(), current.linkedinUrl(),
                    current.githubUrl(), current.portfolioUrl(), PREFIX + id, current.bio());
            String previous = current.avatarUrl();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) { safeDelete(key); return; }
                    if (previous != null && previous.startsWith(PREFIX)) {
                        try { safeDelete(key(userId, UUID.fromString(previous.substring(PREFIX.length())).toString())); }
                        catch (IllegalArgumentException ignored) { }
                    }
                }
            });
            return updated;
        } catch (RuntimeException failure) {
            safeDelete(key);
            throw failure;
        }
    }

    public InputStream download(Long userId, UUID id) {
        CandidateProfile profile = profiles.getMine(userId);
        if (!(PREFIX + id).equals(profile.avatarUrl())) throw new CandidateProfileNotFoundException();
        return storage.openDownload(bucket, key(userId, id.toString()));
    }

    private void safeDelete(String key) {
        try { storage.delete(key); } catch (RuntimeException ignored) { }
    }

    private static String key(Long userId, String id) {
        return "candidate-avatars/" + userId + "/" + id + ".png";
    }

    private static byte[] normalize(MultipartFile file) {
        try (ImageInputStream input = ImageIO.createImageInputStream(file.getInputStream())) {
            if (input == null) throw new IllegalArgumentException("Ảnh không hợp lệ.");
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IllegalArgumentException("Chỉ hỗ trợ ảnh JPEG hoặc PNG.");
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName();
                if (!format.equalsIgnoreCase("png") && !format.equalsIgnoreCase("jpeg")) {
                    throw new IllegalArgumentException("Chỉ hỗ trợ ảnh JPEG hoặc PNG.");
                }
                reader.setInput(input, true, true);
                if (reader.getWidth(0) > 4096 || reader.getHeight(0) > 4096) {
                    throw new IllegalArgumentException("Kích thước ảnh tối đa là 4096 × 4096 pixel.");
                }
                var image = reader.read(0);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                if (image == null || !ImageIO.write(image, "png", output)) throw new IllegalArgumentException("Ảnh không hợp lệ.");
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (IOException failure) {
            throw new IllegalArgumentException("Không thể đọc ảnh.", failure);
        }
    }
}
