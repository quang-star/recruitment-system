package com.smartrecruitment.core.cv.infrastructure.persistence;

import com.smartrecruitment.core.cv.application.port.CvErasureRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvErasureQueue.CV_ERASURE_QUEUE;

@Repository
public class JooqCvErasureRepository implements CvErasureRepository {
    private final DSLContext dsl;

    public JooqCvErasureRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public List<PendingErasure> claimPending(OffsetDateTime now, int limit) {
        return dsl.selectFrom(CV_ERASURE_QUEUE)
                .where(CV_ERASURE_QUEUE.COMPLETED_AT.isNull())
                .and(CV_ERASURE_QUEUE.NEXT_ATTEMPT_AT.le(now))
                .orderBy(CV_ERASURE_QUEUE.NEXT_ATTEMPT_AT)
                .limit(limit)
                .forUpdate()
                .skipLocked()
                .fetch(entry -> new PendingErasure(entry.getCvVersionId(), entry.getObjectKey(), entry.getAttempts()));
    }

    @Override
    public void markCompleted(Long cvVersionId, OffsetDateTime completedAt) {
        dsl.update(CV_ERASURE_QUEUE)
                .set(CV_ERASURE_QUEUE.COMPLETED_AT, completedAt)
                .set(CV_ERASURE_QUEUE.OBJECT_KEY, (String) null)
                .where(CV_ERASURE_QUEUE.CV_VERSION_ID.eq(cvVersionId))
                .execute();
    }

    @Override
    public void scheduleRetry(Long cvVersionId, int attempts, OffsetDateTime nextAttemptAt) {
        dsl.update(CV_ERASURE_QUEUE)
                .set(CV_ERASURE_QUEUE.ATTEMPTS, attempts)
                .set(CV_ERASURE_QUEUE.NEXT_ATTEMPT_AT, nextAttemptAt)
                .where(CV_ERASURE_QUEUE.CV_VERSION_ID.eq(cvVersionId))
                .execute();
    }
}
