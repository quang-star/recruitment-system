package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.application.port.CandidateCvRepository;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CvServiceTests {
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

    private static MockMultipartFile pdf(String filename) {
        return new MockMultipartFile("file", filename, "application/pdf", "%PDF-1.7\nbody".getBytes());
    }

    private static final class RecordingStorage implements ObjectStorage {
        private final List<String> keys = new ArrayList<>();

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
