package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.application.port.CandidateCvRepository;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CvServiceTests {
    @ParameterizedTest
    @ValueSource(strings = {"\n", "\r\n", " \t\f"})
    void acceptsPdfWithLeadingWhitespaceAndPreservesOriginalChecksum(String prefix) throws Exception {
        RecordingStorage storage = new RecordingStorage();
        CvService service = new CvService(new InMemoryCvs(), storage);
        byte[] content = (prefix + "%PDF-1.7\nbody").getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        CandidateCv created = service.upload(UUID.randomUUID(), "CV",
                new MockMultipartFile("file", "cv.pdf", "application/pdf", content));
        assertThat(created.activeVersion().sha256()).isEqualTo(java.util.HexFormat.of().formatHex(
                java.security.MessageDigest.getInstance("SHA-256").digest(content)));
        assertThat(storage.keys).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"hello%PDF-1.7", "<html>%PDF-1.7", "\n%PD", " \n\t", "\u0000%PDF-1.7"})
    void rejectsDisguisedOrTruncatedPdfBeforeStorage(String content) {
        RecordingStorage storage = new RecordingStorage();
        CvService service = new CvService(new InMemoryCvs(), storage);
        assertThatThrownBy(() -> service.upload(UUID.randomUUID(), null,
                new MockMultipartFile("file", "cv.pdf", "application/pdf", content.getBytes())))
                .isInstanceOf(CvUploadException.class).hasMessage("CV file is not a valid PDF");
        assertThat(storage.keys).isEmpty();
    }

    @Test
    void boundsPdfHeaderSearch() {
        RecordingStorage storage = new RecordingStorage();
        CvService service = new CvService(new InMemoryCvs(), storage);
        assertThatThrownBy(() -> service.upload(UUID.randomUUID(), null,
                new MockMultipartFile("file", "cv.pdf", "application/pdf", (" ".repeat(1024) + "%PDF-1.7").getBytes())))
                .isInstanceOf(CvUploadException.class);
        assertThat(storage.keys).isEmpty();
    }

    @Test
    void storesPdfAndCreatesUploadedVersion() {
        InMemoryCvs cvs = new InMemoryCvs();
        RecordingStorage storage = new RecordingStorage();
        CvService service = new CvService(cvs, storage);

        CandidateCv created = service.upload(UUID.randomUUID(), "Backend CV", pdf("resume.pdf"));

        assertThat(created.title()).isEqualTo("Backend CV");
        assertThat(created.activeVersion().processingStatus().name()).isEqualTo("UPLOADED");
        assertThat(created.activeVersion().sha256()).hasSize(64);
        assertThat(storage.keys).containsExactly(created.activeVersion().objectKey());
        assertThat(cvs.values).containsExactly(created);
    }

    @Test
    void rejectsNonPdfBeforeTouchingStorage() {
        RecordingStorage storage = new RecordingStorage();
        CvService service = new CvService(new InMemoryCvs(), storage);
        MockMultipartFile file = new MockMultipartFile("file", "resume.txt", "text/plain", "hello".getBytes());

        assertThatThrownBy(() -> service.upload(UUID.randomUUID(), null, file))
                .isInstanceOf(CvUploadException.class)
                .hasMessage("CV file must be a PDF");
        assertThat(storage.keys).isEmpty();
    }

    @Test
    void downloadsOnlyTheOwnedActiveVersion() throws Exception {
        var repository = new InMemoryCvs();
        var storage = new RecordingStorage();
        var service = new CvService(repository, storage);
        UUID owner = UUID.randomUUID();
        var cv = service.upload(owner, "CV", pdf("resume.pdf"));
        assertThatThrownBy(() -> service.downloadMine(UUID.randomUUID(), cv.publicId(), cv.activeVersion().publicId()))
                .isInstanceOf(CandidateCvNotFoundException.class);
        assertThatThrownBy(() -> service.downloadMine(owner, cv.publicId(), UUID.randomUUID()))
                .isInstanceOf(CandidateCvNotFoundException.class);
        assertThat(storage.downloads).isZero();
        var download = service.downloadMine(owner, cv.publicId(), cv.activeVersion().publicId());
        try (var content = download.content()) { assertThat(new String(content.readAllBytes())).startsWith("%PDF"); }
        assertThat(download.originalFilename()).isEqualTo("resume.pdf");
        assertThat(storage.downloads).isEqualTo(1);
    }

    @Test
    void neverDownloadsAnErasedOrInactiveCv() {
        var repository = new InMemoryCvs();
        var storage = new RecordingStorage();
        var service = new CvService(repository, storage);
        UUID owner = UUID.randomUUID();
        var cv = service.upload(owner, "CV", pdf("resume.pdf"));
        for (var status : List.of(com.smartrecruitment.core.cv.domain.CvStatus.DELETED,
                com.smartrecruitment.core.cv.domain.CvStatus.ARCHIVED)) {
            repository.values.clear();
            repository.values.add(new CandidateCv(cv.publicId(), owner, cv.title(), status, cv.activeVersion(), 1));
            assertThatThrownBy(() -> service.downloadMine(owner, cv.publicId(), cv.activeVersion().publicId()))
                    .isInstanceOf(CandidateCvNotFoundException.class);
        }
        assertThat(storage.downloads).isZero();
    }

    private static MockMultipartFile pdf(String filename) {
        return new MockMultipartFile("file", filename, "application/pdf", "%PDF-1.7\nbody".getBytes());
    }

    private static final class RecordingStorage implements ObjectStorage {
        private final List<String> keys = new ArrayList<>();
        private int downloads;
        @Override
        public InputStream openDownload(String bucket, String key) {
            downloads++;
            assertThat(keys).contains(key);
            return new java.io.ByteArrayInputStream("%PDF-1.7\nbody".getBytes());
        }

        @Override
        public void put(String objectKey, InputStream input, long size, String contentType) {
            keys.add(objectKey);
        }

        @Override
        public void delete(String objectKey) {
            keys.remove(objectKey);
        }
    }

    private static final class InMemoryCvs implements CandidateCvRepository {
        private final List<CandidateCv> values = new ArrayList<>();

        @Override
        public CandidateCv insert(CandidateCv cv) {
            values.add(cv);
            return cv;
        }

        @Override
        public boolean updateProcessingStatus(UUID cvVersionId, String sourceHash,
                                              com.smartrecruitment.core.cv.domain.CvProcessingStatus status,
                                              String failureCode) {
            return true;
        }

        @Override
        public List<CandidateCv> findByCandidateUserId(UUID candidateUserId) {
            return values.stream().filter(cv -> cv.candidateUserId().equals(candidateUserId)).toList();
        }

        @Override
        public Optional<CandidateCv> findByPublicId(UUID candidateUserId, UUID cvId) {
            return values.stream().filter(cv -> cv.candidateUserId().equals(candidateUserId)
                    && cv.publicId().equals(cvId)).findFirst();
        }
    }
}
