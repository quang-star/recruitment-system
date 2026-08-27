package com.smartrecruitment.core.job.infrastructure.persistence;

import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobProcessingProjections.JOB_PROCESSING_PROJECTIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;

@Repository
public class JooqJobProcessingProjectionRepository {
    private final DSLContext dsl;

    public JooqJobProcessingProjectionRepository(DSLContext dsl) { this.dsl = dsl; }

    @Transactional
    public void update(UUID jobId, UUID jobVersionId, UUID processingTaskId,
                       String sourceHash, String status, String failureCode) {
        String expectedHash = dsl.select(JOB_VERSIONS.SOURCE_HASH).from(JOB_VERSIONS)
                .where(JOB_VERSIONS.PUBLIC_ID.eq(jobVersionId)).fetchOne(JOB_VERSIONS.SOURCE_HASH);
        if (expectedHash == null || !expectedHash.trim().equals(sourceHash)) {
            return;
        }
        var current = dsl.selectFrom(JOB_PROCESSING_PROJECTIONS)
                .where(JOB_PROCESSING_PROJECTIONS.JOB_VERSION_ID.eq(jobVersionId))
                .fetchOne();
        if (current == null) {
            dsl.insertInto(JOB_PROCESSING_PROJECTIONS)
                    .set(JOB_PROCESSING_PROJECTIONS.JOB_ID, jobId)
                    .set(JOB_PROCESSING_PROJECTIONS.JOB_VERSION_ID, jobVersionId)
                    .set(JOB_PROCESSING_PROJECTIONS.PROCESSING_TASK_ID, processingTaskId)
                    .set(JOB_PROCESSING_PROJECTIONS.SOURCE_HASH, sourceHash)
                    .set(JOB_PROCESSING_PROJECTIONS.STATUS, status)
                    .set(JOB_PROCESSING_PROJECTIONS.FAILURE_CODE, failureCode)
                    .set(JOB_PROCESSING_PROJECTIONS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                    .set(JOB_PROCESSING_PROJECTIONS.VERSION, 0L)
                    .execute();
            return;
        }
        if (!sourceHash.equals(current.getSourceHash().trim())) {
            return;
        }
        if ("CONFIRMED".equals(current.getStatus()) && !"CONFIRMED".equals(status)) {
            return;
        }
        dsl.update(JOB_PROCESSING_PROJECTIONS)
                .set(JOB_PROCESSING_PROJECTIONS.PROCESSING_TASK_ID, processingTaskId)
                .set(JOB_PROCESSING_PROJECTIONS.SOURCE_HASH, sourceHash)
                .set(JOB_PROCESSING_PROJECTIONS.STATUS, status)
                .set(JOB_PROCESSING_PROJECTIONS.FAILURE_CODE, failureCode)
                .set(JOB_PROCESSING_PROJECTIONS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(JOB_PROCESSING_PROJECTIONS.VERSION, JOB_PROCESSING_PROJECTIONS.VERSION.plus(1L))
                .where(JOB_PROCESSING_PROJECTIONS.JOB_VERSION_ID.eq(jobVersionId))
                .execute();
    }

    public boolean isConfirmed(UUID jobVersionId) {
        return dsl.fetchExists(dsl.selectOne().from(JOB_PROCESSING_PROJECTIONS)
                .where(JOB_PROCESSING_PROJECTIONS.JOB_VERSION_ID.eq(jobVersionId))
                .and(JOB_PROCESSING_PROJECTIONS.STATUS.eq("CONFIRMED")));
    }
}
