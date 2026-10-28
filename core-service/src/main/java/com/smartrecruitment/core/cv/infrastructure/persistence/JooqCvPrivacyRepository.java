package com.smartrecruitment.core.cv.infrastructure.persistence;

import com.smartrecruitment.core.cv.application.port.CvPrivacyRepository;
import com.smartrecruitment.core.cv.domain.CvStatus;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationCvAccessGrants.APPLICATION_CV_ACCESS_GRANTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationMatchingProjections.APPLICATION_MATCHING_PROJECTIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationStatusHistory.APPLICATION_STATUS_HISTORY;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvErasureQueue.CV_ERASURE_QUEUE;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;

@Repository
public class JooqCvPrivacyRepository implements CvPrivacyRepository {
    private final DSLContext dsl;

    public JooqCvPrivacyRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public Optional<DeletionState> lockOwned(Long candidateUserId, Long cvId) {
        return dsl.selectFrom(CVS)
                .where(CVS.ID.eq(cvId))
                .and(CVS.CANDIDATE_USER_ID.eq(candidateUserId))
                .forUpdate()
                .fetchOptional(record -> new DeletionState(CvStatus.valueOf(record.getStatus()), record.getVersion()));
    }

    @Override
    public List<Long> eraseLocked(Long cvId, OffsetDateTime erasedAt) {
        long internalCvId = dsl.select(CVS.ID).from(CVS)
                .where(CVS.ID.eq(cvId)).fetchOptional(CVS.ID)
                .orElseThrow(() -> new IllegalStateException("CV must exist before erasure"));
        var versions = dsl.selectFrom(CV_VERSIONS)
                .where(CV_VERSIONS.CV_ID.eq(internalCvId)).forUpdate().fetch();

        // Late matching messages take the same application locks before writing results.
        var applicationIds = dsl.select(APPLICATIONS.ID).from(APPLICATIONS)
                .where(APPLICATIONS.CV_ID.eq(internalCvId))
                .orderBy(APPLICATIONS.ID).forUpdate().fetch(APPLICATIONS.ID);
        var internalApplicationIds = dsl.select(APPLICATIONS.ID).from(APPLICATIONS)
                .where(APPLICATIONS.CV_ID.eq(internalCvId));
        dsl.update(APPLICATION_CV_ACCESS_GRANTS)
                .set(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT,
                        DSL.greatest(DSL.val(erasedAt), APPLICATION_CV_ACCESS_GRANTS.GRANTED_AT))
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.in(internalApplicationIds))
                .and(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT.isNull()).execute();
        dsl.deleteFrom(APPLICATION_MATCHING_PROJECTIONS)
                .where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.in(applicationIds)).execute();

        // Free text can contain copied CV details; retain transition metadata only.
        dsl.update(APPLICATION_STATUS_HISTORY)
                .set(APPLICATION_STATUS_HISTORY.REASON,
                        DSL.when(APPLICATION_STATUS_HISTORY.TO_STATUS.in("REJECTED", "WITHDRAWN"),
                                "Nội dung đã được xóa cùng CV.").otherwise((String) null))
                .where(APPLICATION_STATUS_HISTORY.APPLICATION_ID.in(internalApplicationIds)).execute();
        dsl.update(APPLICATIONS).set(APPLICATIONS.COVER_LETTER, (String) null)
                .set(APPLICATIONS.UPDATED_AT,
                        DSL.greatest(DSL.val(erasedAt), APPLICATIONS.APPLIED_AT, APPLICATIONS.UPDATED_AT))
                .set(APPLICATIONS.VERSION, APPLICATIONS.VERSION.plus(1L))
                .where(APPLICATIONS.CV_ID.eq(internalCvId)).execute();

        for (var version : versions) {
            dsl.insertInto(CV_ERASURE_QUEUE)
                    .set(CV_ERASURE_QUEUE.CV_VERSION_ID, version.getId())
                    .set(CV_ERASURE_QUEUE.OBJECT_KEY, version.getObjectKey())
                    .onConflictDoNothing().execute();
        }
        // Database and application clocks can differ; erasure must never move time backwards.
        dsl.update(CV_VERSIONS).set(CV_VERSIONS.PROCESSING_STATUS, "DELETED")
                .set(CV_VERSIONS.ORIGINAL_FILENAME, "deleted.pdf")
                .set(CV_VERSIONS.OBJECT_KEY, DSL.concat(DSL.val("deleted/"), CV_VERSIONS.ID.cast(String.class)))
                .set(CV_VERSIONS.SHA256, "0".repeat(64)).set(CV_VERSIONS.SIZE_BYTES, 1L)
                .set(CV_VERSIONS.LANGUAGE_HINT, (String) null).set(CV_VERSIONS.FAILURE_CODE, (String) null)
                .set(CV_VERSIONS.CONFIRMED_AT, (OffsetDateTime) null)
                .set(CV_VERSIONS.EXTERNAL_AI_CONSENT, false)
                .set(CV_VERSIONS.EXTERNAL_AI_POLICY_VERSION, (String) null)
                .set(CV_VERSIONS.UPDATED_AT,
                        DSL.greatest(DSL.val(erasedAt), CV_VERSIONS.CREATED_AT, CV_VERSIONS.UPDATED_AT))
                .set(CV_VERSIONS.VERSION, CV_VERSIONS.VERSION.plus(1L))
                .where(CV_VERSIONS.CV_ID.eq(internalCvId)).execute();
        var cvErasedAt = DSL.greatest(DSL.val(erasedAt), CVS.CREATED_AT, CVS.UPDATED_AT);
        dsl.update(CVS).set(CVS.STATUS, "DELETED").set(CVS.TITLE, "CV đã xóa")
                .set(CVS.DELETED_AT, cvErasedAt).set(CVS.UPDATED_AT, cvErasedAt)
                .set(CVS.VERSION, CVS.VERSION.plus(1L))
                .where(CVS.ID.eq(internalCvId)).execute();
        return versions.map(version -> version.getId());
    }
}
