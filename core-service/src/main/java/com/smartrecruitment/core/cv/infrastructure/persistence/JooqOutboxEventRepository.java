package com.smartrecruitment.core.cv.infrastructure.persistence;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.cv.application.CvUploadedEvent;
import com.smartrecruitment.core.application.application.ApplicationSubmittedEvent;
import com.smartrecruitment.core.job.application.JobVersionSubmittedEvent;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import org.jooq.DSLContext;
import org.jooq.JSON;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.OutboxEvents.OUTBOX_EVENTS;

@Repository
public class JooqOutboxEventRepository implements OutboxEventRepository {
    private final DSLContext dsl;
    private final ObjectMapper objectMapper;

    public JooqOutboxEventRepository(DSLContext dsl, ObjectMapper objectMapper) {
        this.dsl = dsl;
        this.objectMapper = objectMapper;
    }

    @Override
    public void append(CvUploadedEvent event) {
        try {
            String payload = objectMapper.writeValueAsString(eventPayload(event));
            OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
            dsl.insertInto(OUTBOX_EVENTS)
                    .set(OUTBOX_EVENTS.PUBLIC_ID, UUID.randomUUID())
                    .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "CV")
                    .set(OUTBOX_EVENTS.AGGREGATE_ID, event.cvId())
                    .set(OUTBOX_EVENTS.AGGREGATE_VERSION, 1L)
                    .set(OUTBOX_EVENTS.EVENT_TYPE, "cv.uploaded.v1")
                    .set(OUTBOX_EVENTS.SCHEMA_VERSION, (short) 1)
                    .set(OUTBOX_EVENTS.IDEMPOTENCY_KEY, "cv.uploaded.v1:" + event.cvVersionId())
                    .set(OUTBOX_EVENTS.CORRELATION_ID, event.correlationId())
                    .set(OUTBOX_EVENTS.PAYLOAD, JSON.json(payload))
                    .set(OUTBOX_EVENTS.OCCURRED_AT, event.occurredAt())
                    .set(OUTBOX_EVENTS.AVAILABLE_AT, now)
                    .set(OUTBOX_EVENTS.ATTEMPT_COUNT, 0)
                    .execute();
        } catch (JacksonException exception) {
            throw new IllegalStateException("Could not serialize CV upload event", exception);
        }
    }

    @Override
    public void append(ApplicationSubmittedEvent event) {
        try {
            String payload = objectMapper.writeValueAsString(new Object() {
                public final UUID applicationId = event.applicationId();
                public final UUID cvVersionId = event.cvVersionId();
                public final UUID jobVersionId = event.jobVersionId();
            });
            OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
            dsl.insertInto(OUTBOX_EVENTS)
                    .set(OUTBOX_EVENTS.PUBLIC_ID, UUID.randomUUID())
                    .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "APPLICATION")
                    .set(OUTBOX_EVENTS.AGGREGATE_ID, event.applicationId())
                    .set(OUTBOX_EVENTS.AGGREGATE_VERSION, 0L)
                    .set(OUTBOX_EVENTS.EVENT_TYPE, "application.submitted.v1")
                    .set(OUTBOX_EVENTS.SCHEMA_VERSION, (short) 1)
                    .set(OUTBOX_EVENTS.IDEMPOTENCY_KEY, "application.submitted.v1:" + event.applicationId())
                    .set(OUTBOX_EVENTS.CORRELATION_ID, event.correlationId())
                    .set(OUTBOX_EVENTS.PAYLOAD, JSON.json(payload))
                    .set(OUTBOX_EVENTS.OCCURRED_AT, event.occurredAt())
                    .set(OUTBOX_EVENTS.AVAILABLE_AT, now)
                    .set(OUTBOX_EVENTS.ATTEMPT_COUNT, 0)
                    .execute();
        } catch (JacksonException exception) {
            throw new IllegalStateException("Could not serialize application submission event", exception);
        }
    }

    @Override
    public void append(JobVersionSubmittedEvent event) {
        try {
            String payload = objectMapper.writeValueAsString(new Object() {
                public final UUID jobId = event.jobId();
                public final UUID jobVersionId = event.jobVersionId();
                public final UUID recruiterUserId = event.recruiterUserId();
                public final String sourceHash = event.sourceHash();
                public final String objectRef = event.objectRef();
            });
            OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
            dsl.insertInto(OUTBOX_EVENTS)
                    .set(OUTBOX_EVENTS.PUBLIC_ID, UUID.randomUUID())
                    .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "JOB")
                    .set(OUTBOX_EVENTS.AGGREGATE_ID, event.jobId())
                    .set(OUTBOX_EVENTS.AGGREGATE_VERSION, 0L)
                    .set(OUTBOX_EVENTS.EVENT_TYPE, "job.version.submitted.v1")
                    .set(OUTBOX_EVENTS.SCHEMA_VERSION, (short) 1)
                    .set(OUTBOX_EVENTS.IDEMPOTENCY_KEY, "job.version.submitted.v1:" + event.jobVersionId())
                    .set(OUTBOX_EVENTS.CORRELATION_ID, event.correlationId())
                    .set(OUTBOX_EVENTS.PAYLOAD, JSON.json(payload))
                    .set(OUTBOX_EVENTS.OCCURRED_AT, event.occurredAt())
                    .set(OUTBOX_EVENTS.AVAILABLE_AT, now)
                    .set(OUTBOX_EVENTS.ATTEMPT_COUNT, 0)
                    .execute();
        } catch (JacksonException exception) {
            throw new IllegalStateException("Could not serialize Job version submission event", exception);
        }
    }

    @Transactional
    public List<PendingOutboxEvent> claimPending(String workerId, int limit) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime staleBefore = now.minusSeconds(30);
        var records = dsl.selectFrom(OUTBOX_EVENTS)
                .where(OUTBOX_EVENTS.PUBLISHED_AT.isNull())
                .and(OUTBOX_EVENTS.AVAILABLE_AT.le(now))
                .and(OUTBOX_EVENTS.LOCKED_AT.isNull().or(OUTBOX_EVENTS.LOCKED_AT.lt(staleBefore)))
                .orderBy(OUTBOX_EVENTS.OCCURRED_AT.asc())
                .limit(limit)
                .forUpdate()
                .skipLocked()
                .fetch();

        records.forEach(record -> dsl.update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.LOCKED_BY, workerId)
                .set(OUTBOX_EVENTS.LOCKED_AT, now)
                .set(OUTBOX_EVENTS.ATTEMPT_COUNT, OUTBOX_EVENTS.ATTEMPT_COUNT.add(1))
                .where(OUTBOX_EVENTS.ID.eq(record.getId()))
                .execute());

        return records.map(record -> new PendingOutboxEvent(
                record.getId(), record.getPublicId(), record.getAggregateId(), record.getEventType(),
                record.getSchemaVersion(), record.getIdempotencyKey(), record.getCorrelationId(),
                record.getOccurredAt(), record.getPayload().data()));
    }

    @Transactional
    public void markPublished(long id, String workerId) {
        dsl.update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.PUBLISHED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(OUTBOX_EVENTS.LOCKED_BY, (String) null)
                .set(OUTBOX_EVENTS.LOCKED_AT, (OffsetDateTime) null)
                .set(OUTBOX_EVENTS.LAST_ERROR_CODE, (String) null)
                .set(OUTBOX_EVENTS.LAST_ERROR_AT, (OffsetDateTime) null)
                .where(OUTBOX_EVENTS.ID.eq(id))
                .and(OUTBOX_EVENTS.LOCKED_BY.eq(workerId))
                .and(OUTBOX_EVENTS.PUBLISHED_AT.isNull())
                .execute();
    }

    @Transactional
    public void markFailed(long id, String workerId, String errorCode) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        dsl.update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.AVAILABLE_AT, now.plusSeconds(5))
                .set(OUTBOX_EVENTS.LOCKED_BY, (String) null)
                .set(OUTBOX_EVENTS.LOCKED_AT, (OffsetDateTime) null)
                .set(OUTBOX_EVENTS.LAST_ERROR_CODE, errorCode)
                .set(OUTBOX_EVENTS.LAST_ERROR_AT, now)
                .where(OUTBOX_EVENTS.ID.eq(id))
                .and(OUTBOX_EVENTS.LOCKED_BY.eq(workerId))
                .and(OUTBOX_EVENTS.PUBLISHED_AT.isNull())
                .execute();
    }

    private static Object eventPayload(CvUploadedEvent event) {
        return new Object() {
            public final UUID cvId = event.cvId();
            public final UUID cvVersionId = event.cvVersionId();
            public final UUID candidateUserId = event.candidateUserId();
            public final String objectRef = event.objectRef();
            public final String sourceHash = event.sourceHash();
        };
    }

    public record PendingOutboxEvent(long id, UUID eventId, UUID aggregateId, String eventType,
                                     short schemaVersion, String idempotencyKey, UUID correlationId,
                                     OffsetDateTime occurredAt, String payload) {
    }
}
