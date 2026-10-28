package com.smartrecruitment.core.cv.application.port;

import java.time.OffsetDateTime;
import java.util.List;

public interface CvErasureRepository {
    /** Locks due entries until the caller's transaction completes. */
    List<PendingErasure> claimPending(OffsetDateTime now, int limit);

    void markCompleted(Long cvVersionId, OffsetDateTime completedAt);

    void scheduleRetry(Long cvVersionId, int attempts, OffsetDateTime nextAttemptAt);

    record PendingErasure(Long cvVersionId, String objectKey, int attempts) {
    }
}
