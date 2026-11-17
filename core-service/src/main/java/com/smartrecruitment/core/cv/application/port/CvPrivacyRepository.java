package com.smartrecruitment.core.cv.application.port;

import com.smartrecruitment.core.cv.domain.CvStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface CvPrivacyRepository {
    Optional<DeletionState> lockOwned(Long candidateUserId, Long cvId);

    /** Called after lockOwned, in the same transaction as the erasure events. */
    List<Long> eraseLocked(Long cvId, OffsetDateTime erasedAt);

    record DeletionState(CvStatus status, long version) {}
}
