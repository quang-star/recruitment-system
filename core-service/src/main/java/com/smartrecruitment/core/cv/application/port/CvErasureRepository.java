package com.smartrecruitment.core.cv.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface CvErasureRepository {
    /** Locks due entries until the caller's transaction completes. */
    List<PendingErasure> claimPending(OffsetDateTime now, int limit);

    void markCompleted(UUID cvVersionId, OffsetDateTime completedAt);

    void scheduleRetry(UUID cvVersionId, int attempts, OffsetDateTime nextAttemptAt);

    record PendingErasure(UUID cvVersionId, String objectKey, int attempts) {
    }
}
