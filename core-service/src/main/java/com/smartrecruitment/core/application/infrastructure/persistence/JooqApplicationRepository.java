package com.smartrecruitment.core.application.infrastructure.persistence;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationSource;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationStatusHistory.APPLICATION_STATUS_HISTORY;

@Repository
public class JooqApplicationRepository implements ApplicationRepository {
    private final DSLContext dsl;

    public JooqApplicationRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Application insert(UUID candidateUserId, UUID jobId, UUID cvId) {
        var snapshot = dsl.select(JOBS.ID, JOBS.COMPANY_ID, JOBS.ACTIVE_VERSION_ID,
                        JOB_VERSIONS.ID.as("selected_job_version_id"), CVS.ID.as("selected_cv_id"),
                        CV_VERSIONS.ID.as("selected_cv_version_id"))
                .from(JOBS).join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(JOBS.ACTIVE_VERSION_ID))
                .join(CVS).on(CVS.PUBLIC_ID.eq(cvId).and(CVS.CANDIDATE_USER_ID.eq(candidateUserId)))
                .join(CV_VERSIONS).on(CV_VERSIONS.CV_ID.eq(CVS.ID).and(CV_VERSIONS.ID.eq(CVS.ACTIVE_VERSION_ID)))
                .where(JOBS.PUBLIC_ID.eq(jobId)).and(JOBS.STATUS.eq("PUBLISHED"))
                .and(CV_VERSIONS.PROCESSING_STATUS.eq("CONFIRMED"))
                .and(JOB_VERSIONS.APPLICATION_DEADLINE.isNull()
                        .or(JOB_VERSIONS.APPLICATION_DEADLINE.gt(OffsetDateTime.now(ZoneOffset.UTC))))
                .fetchOptional();
        if (snapshot.isEmpty()) throw new IllegalArgumentException("Job must be published and CV must be confirmed");
        var row = snapshot.get();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        var record = dsl.insertInto(APPLICATIONS)
                .set(APPLICATIONS.PUBLIC_ID, UUID.randomUUID())
                .set(APPLICATIONS.CANDIDATE_USER_ID, candidateUserId)
                .set(APPLICATIONS.COMPANY_ID, row.get(JOBS.COMPANY_ID))
                .set(APPLICATIONS.CV_ID, row.get("selected_cv_id", Long.class))
                .set(APPLICATIONS.CV_VERSION_ID, row.get("selected_cv_version_id", Long.class))
                .set(APPLICATIONS.JOB_ID, row.get(JOBS.ID))
                .set(APPLICATIONS.JOB_VERSION_ID, row.get("selected_job_version_id", Long.class))
                .set(APPLICATIONS.STATUS, ApplicationStatus.SUBMITTED.name())
                .set(APPLICATIONS.SOURCE, ApplicationSource.DIRECT.name())
                .set(APPLICATIONS.APPLIED_AT, now)
                .set(APPLICATIONS.UPDATED_AT, now)
                .set(APPLICATIONS.VERSION, 0L)
                .returning().fetchOne();
        if (record == null) throw new IllegalStateException("Insert application returned no record");
        history(record.getId(), null, ApplicationStatus.SUBMITTED, candidateUserId, null, now);
        return findForCandidateById(candidateUserId, record.getPublicId()).orElseThrow();
    }

    @Override
    public List<Application> findAllForCandidate(UUID candidateUserId) {
        return applicationQuery().where(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .orderBy(APPLICATIONS.APPLIED_AT.desc()).fetch(this::toDomain);
    }

    @Override
    public List<Application> findAllForRecruiter(UUID recruiterUserId, UUID jobId) {
        return applicationQuery().join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(JOBS.PUBLIC_ID.eq(jobId)).orderBy(APPLICATIONS.APPLIED_AT.desc()).fetch(this::toDomain);
    }

    @Override
    public Optional<Application> findForRecruiter(UUID recruiterUserId, UUID applicationId) {
        return applicationQuery().join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(APPLICATIONS.PUBLIC_ID.eq(applicationId)).fetchOptional(this::toDomain);
    }

    @Override
    public Optional<Application> updateStatus(UUID recruiterUserId, UUID applicationId, ApplicationStatus status,
                                              String reason, long expectedVersion) {
        var current = findForRecruiter(recruiterUserId, applicationId);
        if (current.isEmpty()) return Optional.empty();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        int updated = dsl.update(APPLICATIONS).set(APPLICATIONS.STATUS, status.name())
                .set(APPLICATIONS.UPDATED_AT, now).set(APPLICATIONS.VERSION, APPLICATIONS.VERSION.plus(1L))
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId)).and(APPLICATIONS.VERSION.eq(expectedVersion))
                .execute();
        if (updated != 1) return Optional.empty();
        history(internalId(applicationId), current.get().status(), status, recruiterUserId, reason, now);
        return findForRecruiter(recruiterUserId, applicationId);
    }

    private org.jooq.SelectJoinStep<org.jooq.Record> applicationQuery() {
        return dsl.select(APPLICATIONS.fields()).select(COMPANIES.PUBLIC_ID, JOBS.PUBLIC_ID,
                        JOB_VERSIONS.PUBLIC_ID, CVS.PUBLIC_ID, CV_VERSIONS.PUBLIC_ID)
                .from(APPLICATIONS).join(COMPANIES).on(COMPANIES.ID.eq(APPLICATIONS.COMPANY_ID))
                .join(JOBS).on(JOBS.ID.eq(APPLICATIONS.JOB_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(APPLICATIONS.JOB_VERSION_ID))
                .join(CVS).on(CVS.ID.eq(APPLICATIONS.CV_ID))
                .join(CV_VERSIONS).on(CV_VERSIONS.ID.eq(APPLICATIONS.CV_VERSION_ID));
    }

    private Optional<Application> findForCandidateById(UUID candidateUserId, UUID applicationId) {
        return applicationQuery().where(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(APPLICATIONS.PUBLIC_ID.eq(applicationId)).fetchOptional(this::toDomain);
    }

    private Long internalId(UUID applicationId) {
        return dsl.select(APPLICATIONS.ID).from(APPLICATIONS)
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId)).fetchOne(APPLICATIONS.ID);
    }

    private void history(Long applicationId, ApplicationStatus from, ApplicationStatus to, UUID actor,
                         String reason, OffsetDateTime now) {
        dsl.insertInto(APPLICATION_STATUS_HISTORY)
                .set(APPLICATION_STATUS_HISTORY.PUBLIC_ID, UUID.randomUUID())
                .set(APPLICATION_STATUS_HISTORY.APPLICATION_ID, applicationId)
                .set(APPLICATION_STATUS_HISTORY.FROM_STATUS, from == null ? null : from.name())
                .set(APPLICATION_STATUS_HISTORY.TO_STATUS, to.name())
                .set(APPLICATION_STATUS_HISTORY.ACTOR_USER_ID, actor)
                .set(APPLICATION_STATUS_HISTORY.REASON, reason)
                .set(APPLICATION_STATUS_HISTORY.OCCURRED_AT, now).execute();
    }

    private Application toDomain(org.jooq.Record record) {
        return new Application(record.get(APPLICATIONS.PUBLIC_ID), record.get(APPLICATIONS.CANDIDATE_USER_ID),
                record.get(COMPANIES.PUBLIC_ID), record.get(CVS.PUBLIC_ID), record.get(CV_VERSIONS.PUBLIC_ID),
                record.get(JOBS.PUBLIC_ID), record.get(JOB_VERSIONS.PUBLIC_ID),
                ApplicationStatus.valueOf(record.get(APPLICATIONS.STATUS)),
                ApplicationSource.valueOf(record.get(APPLICATIONS.SOURCE)), record.get(APPLICATIONS.APPLIED_AT),
                record.get(APPLICATIONS.UPDATED_AT), record.get(APPLICATIONS.VERSION));
    }
}
