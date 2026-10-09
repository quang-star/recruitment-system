package com.smartrecruitment.core.cv.application.port;

import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CandidateCvRepository {
    CandidateCv insert(CandidateCv cv);
    boolean updateProcessingStatus(UUID cvVersionId, String sourceHash,
                                   CvProcessingStatus status, String failureCode);
    default boolean updateProcessingAttemptStatus(UUID cvVersionId, String sourceHash,
                                                  CvProcessingStatus status, String failureCode, long generation) {
        return updateProcessingStatus(cvVersionId, sourceHash, status, failureCode);
    }
    default Optional<CandidateCv> queueRetry(UUID candidateUserId, UUID cvId, UUID cvVersionId, long expectedVersion) {
        throw new UnsupportedOperationException("CV retry is not supported by this repository");
    }
    List<CandidateCv> findByCandidateUserId(UUID candidateUserId);
    Optional<CandidateCv> findByPublicId(UUID candidateUserId, UUID cvId);
}
