package com.smartrecruitment.core.cv.application.port;

import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;

import java.util.List;
import java.util.Optional;

public interface CandidateCvRepository {
    CandidateCv insert(CandidateCv cv);
    boolean updateProcessingStatus(Long cvVersionId, String sourceHash,
                                   CvProcessingStatus status, String failureCode);
    default boolean updateProcessingAttemptStatus(Long cvVersionId, String sourceHash,
                                                  CvProcessingStatus status, String failureCode, long generation) {
        return updateProcessingStatus(cvVersionId, sourceHash, status, failureCode);
    }
    default Optional<CandidateCv> queueRetry(Long candidateUserId, Long cvId, Long cvVersionId, long expectedVersion) {
        throw new UnsupportedOperationException("CV retry is not supported by this repository");
    }
    List<CandidateCv> findByCandidateUserId(Long candidateUserId);
    Optional<CandidateCv> findById(Long candidateUserId, Long cvId);
}
