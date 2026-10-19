package com.smartrecruitment.core.cv.application.port;

import com.smartrecruitment.core.cv.domain.CvStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CvPrivacyRepository {
    Optional<DeletionState> lockOwned(UUID candidateUserId, UUID cvId);

    /** Called after lockOwned, in the same transaction as the erasure events. */
    List<UUID> eraseLocked(UUID cvId, OffsetDateTime erasedAt);

    record DeletionState(CvStatus status, long version) {}
}
