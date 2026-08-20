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
    List<CandidateCv> findByCandidateUserId(UUID candidateUserId);
    Optional<CandidateCv> findByPublicId(UUID candidateUserId, UUID cvId);
}
