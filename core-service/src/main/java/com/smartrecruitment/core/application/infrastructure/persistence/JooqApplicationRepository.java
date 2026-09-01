package com.smartrecruitment.core.application.infrastructure.persistence;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.application.ApplicationConflictException;
import com.smartrecruitment.core.application.application.ApplicationSubmission;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationSource;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.application.domain.ApplicationCvSnapshot;
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
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CandidateConsents.CANDIDATE_CONSENTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationCvAccessGrants.APPLICATION_CV_ACCESS_GRANTS;

@Repository
public class JooqApplicationRepository implements ApplicationRepository {
    private final DSLContext dsl;

    public JooqApplicationRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Application insert(UUID candidateUserId, UUID jobId, UUID cvId) {
        return insert(candidateUserId, jobId, cvId, true, "cv-sharing-v1");
    }

    @Override
    public Application insert(UUID candidateUserId, UUID jobId, UUID cvId,
                              boolean consentAccepted, String policyVersion) {
        String uniqueHash = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        return submit(candidateUserId, jobId, cvId, null, null, consentAccepted, policyVersion,
                uniqueHash, uniqueHash).application();
    }

    @Override
    public ApplicationSubmission submit(UUID candidateUserId, UUID jobId, UUID cvId, UUID cvVersionId,
                                        String coverLetter, boolean consentAccepted, String policyVersion,
                                        String idempotencyKeyHash, String requestHash) {
        if (!consentAccepted) throw new IllegalArgumentException("CV sharing consent is required");
        var existingReplay = findReplay(candidateUserId, idempotencyKeyHash, requestHash);
        if (existingReplay.isPresent()) return existingReplay.get();
        var snapshot = dsl.select(JOBS.ID, JOBS.COMPANY_ID, JOBS.ACTIVE_VERSION_ID,
                        JOB_VERSIONS.ID.as("selected_job_version_id"), CVS.ID.as("selected_cv_id"),
                        CV_VERSIONS.ID.as("selected_cv_version_id"))
                .from(JOBS).join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(JOBS.ACTIVE_VERSION_ID))
                .join(CVS).on(CVS.PUBLIC_ID.eq(cvId).and(CVS.CANDIDATE_USER_ID.eq(candidateUserId)))
                .join(CV_VERSIONS).on(CV_VERSIONS.CV_ID.eq(CVS.ID).and(cvVersionId == null
                        ? CV_VERSIONS.ID.eq(CVS.ACTIVE_VERSION_ID)
                        : CV_VERSIONS.PUBLIC_ID.eq(cvVersionId)))
                .where(JOBS.PUBLIC_ID.eq(jobId)).and(JOBS.STATUS.eq("PUBLISHED"))
                .and(CVS.STATUS.eq("ACTIVE"))
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
                .set(APPLICATIONS.COVER_LETTER, coverLetter)
                .set(APPLICATIONS.CONSENT_ACCEPTED, true)
                .set(APPLICATIONS.CONSENT_POLICY_VERSION, policyVersion)
                .set(APPLICATIONS.SUBMISSION_IDEMPOTENCY_KEY_HASH, idempotencyKeyHash)
                .set(APPLICATIONS.SUBMISSION_REQUEST_HASH, requestHash)
                .set(APPLICATIONS.APPLIED_AT, now)
                .set(APPLICATIONS.UPDATED_AT, now)
                .set(APPLICATIONS.VERSION, 0L)
                .onConflictDoNothing()
                .returning().fetchOne();
        if (record == null) {
            var replay = findReplay(candidateUserId, idempotencyKeyHash, requestHash);
            if (replay.isPresent()) return replay.get();
            throw new ApplicationConflictException("Candidate has already applied to this job");
        }
        Long consentId = consentId(candidateUserId, policyVersion, now);
        dsl.insertInto(APPLICATION_CV_ACCESS_GRANTS)
                .set(APPLICATION_CV_ACCESS_GRANTS.PUBLIC_ID, UUID.randomUUID())
                .set(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID, record.getId())
                .set(APPLICATION_CV_ACCESS_GRANTS.CV_VERSION_ID, row.get("selected_cv_version_id", Long.class))
                .set(APPLICATION_CV_ACCESS_GRANTS.COMPANY_ID, row.get(JOBS.COMPANY_ID))
                .set(APPLICATION_CV_ACCESS_GRANTS.CONSENT_ID, consentId)
                .set(APPLICATION_CV_ACCESS_GRANTS.GRANTED_AT, now)
                .execute();
        history(record.getId(), null, ApplicationStatus.SUBMITTED, candidateUserId, null, now);
        return new ApplicationSubmission(findForCandidateById(candidateUserId, record.getPublicId()).orElseThrow(), true);
    }

    @Override
    public List<Application> findAllForCandidate(UUID candidateUserId) {
        return applicationQuery().where(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .orderBy(APPLICATIONS.APPLIED_AT.desc()).fetch(this::toDomain);
    }

    @Override
    public Optional<Application> findForCandidate(UUID candidateUserId, UUID applicationId) {
        return findForCandidateById(candidateUserId, applicationId);
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
        var current = findForReviewer(recruiterUserId, applicationId);
        if (current.isEmpty()) return Optional.empty();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        int updated = dsl.update(APPLICATIONS).set(APPLICATIONS.STATUS, status.name())
                .set(APPLICATIONS.UPDATED_AT, now).set(APPLICATIONS.VERSION, APPLICATIONS.VERSION.plus(1L))
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId)).and(APPLICATIONS.VERSION.eq(expectedVersion))
                .execute();
        if (updated != 1) return Optional.empty();
        history(internalId(applicationId), current.get().status(), status, recruiterUserId, reason, now);
        return findForReviewer(recruiterUserId, applicationId);
    }

    @Override
    public Optional<Application> withdraw(UUID candidateUserId, UUID applicationId, String reason,
                                          long expectedVersion) {
        var current = findForCandidateById(candidateUserId, applicationId);
        if (current.isEmpty()) return Optional.empty();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        int updated = dsl.update(APPLICATIONS)
                .set(APPLICATIONS.STATUS, ApplicationStatus.WITHDRAWN.name())
                .set(APPLICATIONS.UPDATED_AT, now)
                .set(APPLICATIONS.VERSION, APPLICATIONS.VERSION.plus(1L))
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId))
                .and(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(APPLICATIONS.STATUS.in(ApplicationStatus.SUBMITTED.name(),
                        ApplicationStatus.UNDER_REVIEW.name()))
                .and(APPLICATIONS.VERSION.eq(expectedVersion))
                .execute();
        if (updated != 1) return Optional.empty();
        history(internalId(applicationId), current.get().status(), ApplicationStatus.WITHDRAWN,
                candidateUserId, reason, now);
        return findForCandidateById(candidateUserId, applicationId);
    }

    @Override
    public List<ApplicationStatusChange> findHistoryForViewer(UUID viewerUserId, UUID applicationId) {
        boolean canView = dsl.fetchExists(dsl.selectOne().from(APPLICATIONS)
                .leftJoin(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID)
                        .and(COMPANY_MEMBERS.USER_ID.eq(viewerUserId))
                        .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")))
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId))
                .and(APPLICATIONS.CANDIDATE_USER_ID.eq(viewerUserId).or(COMPANY_MEMBERS.ID.isNotNull())));
        if (!canView) return List.of();
        Long applicationInternalId = internalId(applicationId);
        if (applicationInternalId == null) return List.of();
        return dsl.selectFrom(APPLICATION_STATUS_HISTORY)
                .where(APPLICATION_STATUS_HISTORY.APPLICATION_ID.eq(applicationInternalId))
                .orderBy(APPLICATION_STATUS_HISTORY.OCCURRED_AT.asc())
                .fetch(record -> new ApplicationStatusChange(
                        record.getPublicId(),
                        record.getFromStatus() == null ? null : ApplicationStatus.valueOf(record.getFromStatus()),
                        ApplicationStatus.valueOf(record.getToStatus()),
                        record.getActorUserId(), record.getReason(), record.getOccurredAt()));
    }

    @Override
    public Optional<ApplicationCvSnapshot> findCvSnapshotForRecruiter(UUID recruiterUserId, UUID applicationId) {
        return dsl.select(CV_VERSIONS.PUBLIC_ID, CV_VERSIONS.OBJECT_BUCKET,
                        CV_VERSIONS.OBJECT_KEY, CV_VERSIONS.ORIGINAL_FILENAME, CV_VERSIONS.SIZE_BYTES)
                .from(APPLICATIONS)
                .join(APPLICATION_CV_ACCESS_GRANTS)
                    .on(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(APPLICATIONS.ID)
                            .and(APPLICATION_CV_ACCESS_GRANTS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                            .and(APPLICATION_CV_ACCESS_GRANTS.CV_VERSION_ID.eq(APPLICATIONS.CV_VERSION_ID)))
                .join(CANDIDATE_CONSENTS)
                    .on(CANDIDATE_CONSENTS.ID.eq(APPLICATION_CV_ACCESS_GRANTS.CONSENT_ID)
                            .and(CANDIDATE_CONSENTS.CANDIDATE_USER_ID.eq(APPLICATIONS.CANDIDATE_USER_ID)))
                .join(CV_VERSIONS).on(CV_VERSIONS.ID.eq(APPLICATIONS.CV_VERSION_ID))
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId))
                .and(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT.isNull())
                .and(CANDIDATE_CONSENTS.REVOKED_AT.isNull())
                .fetchOptional(record -> new ApplicationCvSnapshot(record.get(CV_VERSIONS.PUBLIC_ID),
                        record.get(CV_VERSIONS.OBJECT_BUCKET), record.get(CV_VERSIONS.OBJECT_KEY),
                        record.get(CV_VERSIONS.ORIGINAL_FILENAME), record.get(CV_VERSIONS.SIZE_BYTES)));
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

    private Optional<ApplicationSubmission> findReplay(UUID candidateUserId, String idempotencyKeyHash,
                                                       String requestHash) {
        var replay = applicationQuery()
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(APPLICATIONS.SUBMISSION_IDEMPOTENCY_KEY_HASH.eq(idempotencyKeyHash))
                .fetchOptional();
        if (replay.isEmpty()) return Optional.empty();
        if (!requestHash.equals(replay.get().get(APPLICATIONS.SUBMISSION_REQUEST_HASH))) {
            throw new ApplicationConflictException(
                    "Idempotency key was already used with a different application request");
        }
        return Optional.of(new ApplicationSubmission(toDomain(replay.get()), false));
    }

    private Optional<Application> findForReviewer(UUID recruiterUserId, UUID applicationId) {
        return applicationQuery().join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANY_MEMBERS.ROLE.in("OWNER", "COMPANY_ADMIN", "RECRUITER"))
                .and(APPLICATIONS.PUBLIC_ID.eq(applicationId)).fetchOptional(this::toDomain);
    }

    private Long internalId(UUID applicationId) {
        return dsl.select(APPLICATIONS.ID).from(APPLICATIONS)
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId)).fetchOne(APPLICATIONS.ID);
    }

    private Long consentId(UUID candidateUserId, String policyVersion, OffsetDateTime now) {
        Long existing = dsl.select(CANDIDATE_CONSENTS.ID).from(CANDIDATE_CONSENTS)
                .where(CANDIDATE_CONSENTS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(CANDIDATE_CONSENTS.CONSENT_TYPE.eq("CV_SHARING"))
                .and(CANDIDATE_CONSENTS.POLICY_VERSION.eq(policyVersion))
                .and(CANDIDATE_CONSENTS.REVOKED_AT.isNull())
                .fetchOne(CANDIDATE_CONSENTS.ID);
        if (existing != null) return existing;
        Long revoked = dsl.select(CANDIDATE_CONSENTS.ID).from(CANDIDATE_CONSENTS)
                .where(CANDIDATE_CONSENTS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(CANDIDATE_CONSENTS.CONSENT_TYPE.eq("CV_SHARING"))
                .and(CANDIDATE_CONSENTS.POLICY_VERSION.eq(policyVersion))
                .fetchOne(CANDIDATE_CONSENTS.ID);
        if (revoked != null) {
            dsl.update(CANDIDATE_CONSENTS)
                    .set(CANDIDATE_CONSENTS.ACCEPTED_AT, now)
                    .set(CANDIDATE_CONSENTS.REVOKED_AT, (OffsetDateTime) null)
                    .where(CANDIDATE_CONSENTS.ID.eq(revoked)).execute();
            return revoked;
        }
        var record = dsl.insertInto(CANDIDATE_CONSENTS)
                .set(CANDIDATE_CONSENTS.PUBLIC_ID, UUID.randomUUID())
                .set(CANDIDATE_CONSENTS.CANDIDATE_USER_ID, candidateUserId)
                .set(CANDIDATE_CONSENTS.CONSENT_TYPE, "CV_SHARING")
                .set(CANDIDATE_CONSENTS.POLICY_VERSION, policyVersion)
                .set(CANDIDATE_CONSENTS.ACCEPTED_AT, now)
                .returning().fetchOne();
        if (record == null) throw new IllegalStateException("Consent was not saved");
        return record.getId();
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
                record.get(JOBS.PUBLIC_ID), record.get(JOB_VERSIONS.PUBLIC_ID), record.get(APPLICATIONS.COVER_LETTER),
                ApplicationStatus.valueOf(record.get(APPLICATIONS.STATUS)),
                ApplicationSource.valueOf(record.get(APPLICATIONS.SOURCE)), record.get(APPLICATIONS.APPLIED_AT),
                record.get(APPLICATIONS.UPDATED_AT), record.get(APPLICATIONS.VERSION));
    }
}
