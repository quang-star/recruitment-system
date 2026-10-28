package com.smartrecruitment.core.application.infrastructure.persistence;

import com.smartrecruitment.core.application.application.ApplicationConflictException;
import com.smartrecruitment.core.application.application.ApplicationSearch;
import com.smartrecruitment.core.application.application.ApplicationSubmission;
import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationCvSnapshot;
import com.smartrecruitment.core.application.domain.ApplicationSource;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.shared.application.PageResult;
import com.smartrecruitment.core.shared.infrastructure.SearchText;

import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.SortField;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationCvAccessGrants.APPLICATION_CV_ACCESS_GRANTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationMatchingProjections.APPLICATION_MATCHING_PROJECTIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationStatusHistory.APPLICATION_STATUS_HISTORY;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CandidateConsents.CANDIDATE_CONSENTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;

@Repository
public class JooqApplicationRepository implements ApplicationRepository {
    private final DSLContext dsl;

    public JooqApplicationRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public PageResult<Application> searchForCandidate(Long userId, ApplicationSearch search) {
        return search(search, APPLICATIONS.CANDIDATE_USER_ID.eq(userId));
    }

    @Override
    public PageResult<Application> searchForRecruiter(Long userId, Long jobId, ApplicationSearch search) {
        return search(search, JOBS.ID.eq(jobId).and(DSL.exists(dsl.selectOne().from(COMPANY_MEMBERS)
                .where(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")))));
    }

    private PageResult<Application> search(ApplicationSearch search, Condition visibility) {
        Condition filters = visibility;
        if (search.status() != null) filters = filters.and(APPLICATIONS.STATUS.eq(search.status().name()));
        if (!search.q().isEmpty()) filters = filters.and(SearchText.contains(JOB_VERSIONS.TITLE, search.q())
                .or(APPLICATIONS.CANDIDATE_USER_ID.cast(String.class).containsIgnoreCase(search.q()))
                .or(SearchText.contains(APPLICATIONS.COVER_LETTER, search.q())));
        var query = applicationQuery().leftJoin(APPLICATION_MATCHING_PROJECTIONS)
                .on(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(APPLICATIONS.ID)).where(filters);
        long total = dsl.fetchCount(query);
        SortField<?> order = switch (search.sort()) {
            case "oldest" -> APPLICATIONS.APPLIED_AT.asc();
            case "score" -> DSL.when(APPLICATION_MATCHING_PROJECTIONS.STATUS.in("COMPLETED", "DEGRADED")
                    .and(cvAccessGranted().isTrue()).and(JOB_VERSIONS.MATCHING_DOMAIN.eq("IT")),
                    APPLICATION_MATCHING_PROJECTIONS.FINAL_SCORE).desc().nullsLast();
            default -> APPLICATIONS.APPLIED_AT.desc();
        };
        var items = query.orderBy(order, APPLICATIONS.ID.asc()).limit(search.size()).offset(search.offset())
                .fetch(this::toDomain);
        return new PageResult<>(items, total, search.page(), search.size());
    }

    @Override
    public Application insert(Long candidateUserId, Long jobId, Long cvId) {
        return insert(candidateUserId, jobId, cvId, true, "cv-sharing-v1");
    }

    @Override
    public Application insert(Long candidateUserId, Long jobId, Long cvId,
                              boolean consentAccepted, String policyVersion) {
        String uniqueHash = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        return submit(candidateUserId, jobId, cvId, null, null, consentAccepted, policyVersion,
                uniqueHash, uniqueHash).application();
    }

    @Override
    public ApplicationSubmission submit(Long candidateUserId, Long jobId, Long cvId, Long cvVersionId,
                                        String coverLetter, boolean consentAccepted, String policyVersion,
                                        String idempotencyKeyHash, String requestHash) {
        if (!consentAccepted) throw new IllegalArgumentException("CV sharing consent is required");
        var existingReplay = findReplay(candidateUserId, idempotencyKeyHash, requestHash);
        if (existingReplay.isPresent()) return existingReplay.get();
        // Serialize new submissions with erasure before reading a usable CV snapshot.
        var ownedCv = dsl.select(CVS.ID).from(CVS)
                .where(CVS.ID.eq(cvId)).and(CVS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(CVS.STATUS.eq("ACTIVE")).forUpdate().fetchOptional();
        if (ownedCv.isEmpty()) throw new IllegalArgumentException("Job must be published and CV must be confirmed");
        var snapshot = dsl.select(JOBS.ID, JOBS.COMPANY_ID, JOBS.ACTIVE_VERSION_ID,
                        JOB_VERSIONS.ID.as("selected_job_version_id"), CVS.ID.as("selected_cv_id"),
                        CV_VERSIONS.ID.as("selected_cv_version_id"))
                .from(JOBS).join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(JOBS.ACTIVE_VERSION_ID))
                .join(CVS).on(CVS.ID.eq(cvId).and(CVS.CANDIDATE_USER_ID.eq(candidateUserId)))
                .join(CV_VERSIONS).on(CV_VERSIONS.CV_ID.eq(CVS.ID).and(cvVersionId == null
                        ? CV_VERSIONS.ID.eq(CVS.ACTIVE_VERSION_ID)
                        : CV_VERSIONS.ID.eq(cvVersionId)))
                .where(JOBS.ID.eq(jobId)).and(JOBS.STATUS.eq("PUBLISHED"))
                .and(CVS.STATUS.eq("ACTIVE"))
                .and(CV_VERSIONS.PROCESSING_STATUS.eq("CONFIRMED"))
                .and(JOB_VERSIONS.APPLICATION_DEADLINE.isNull()
                        .or(JOB_VERSIONS.APPLICATION_DEADLINE.gt(OffsetDateTime.now(ZoneOffset.UTC))))
                .fetchOptional();
        if (snapshot.isEmpty()) throw new IllegalArgumentException("Job must be published and CV must be confirmed");
        var row = snapshot.get();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        var record = dsl.insertInto(APPLICATIONS)

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

                .set(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID, record.getId())
                .set(APPLICATION_CV_ACCESS_GRANTS.CV_VERSION_ID, row.get("selected_cv_version_id", Long.class))
                .set(APPLICATION_CV_ACCESS_GRANTS.COMPANY_ID, row.get(JOBS.COMPANY_ID))
                .set(APPLICATION_CV_ACCESS_GRANTS.CONSENT_ID, consentId)
                .set(APPLICATION_CV_ACCESS_GRANTS.GRANTED_AT, now)
                .execute();
        history(record.getId(), null, ApplicationStatus.SUBMITTED, candidateUserId, null, now);
        return new ApplicationSubmission(findForCandidateById(candidateUserId, record.getId()).orElseThrow(), true);
    }

    @Override
    public List<Application> findAllForCandidate(Long candidateUserId) {
        return applicationQuery().where(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .orderBy(APPLICATIONS.APPLIED_AT.desc()).fetch(this::toDomain);
    }

    @Override
    public Optional<Application> findForCandidate(Long candidateUserId, Long applicationId) {
        return findForCandidateById(candidateUserId, applicationId);
    }

    @Override
    public List<Application> findAllForRecruiter(Long recruiterUserId, Long jobId) {
        return applicationQuery().join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(JOBS.ID.eq(jobId)).orderBy(APPLICATIONS.APPLIED_AT.desc()).fetch(this::toDomain);
    }

    @Override
    public Optional<Application> findForRecruiter(Long recruiterUserId, Long applicationId) {
        return applicationQuery().join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(APPLICATIONS.ID.eq(applicationId)).fetchOptional(this::toDomain);
    }

    @Override
    public Optional<Application> updateStatus(Long recruiterUserId, Long applicationId, ApplicationStatus status,
                                              String reason, long expectedVersion) {
        var current = findForReviewer(recruiterUserId, applicationId);
        if (current.isEmpty()) return Optional.empty();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        int updated = dsl.update(APPLICATIONS).set(APPLICATIONS.STATUS, status.name())
                .set(APPLICATIONS.UPDATED_AT, now).set(APPLICATIONS.VERSION, APPLICATIONS.VERSION.plus(1L))
                .where(APPLICATIONS.ID.eq(applicationId)).and(APPLICATIONS.VERSION.eq(expectedVersion))
                .execute();
        if (updated != 1) return Optional.empty();
        history(internalId(applicationId), current.get().status(), status, recruiterUserId, reason, now);
        return findForReviewer(recruiterUserId, applicationId);
    }

    @Override
    public Optional<Application> withdraw(Long candidateUserId, Long applicationId, String reason,
                                          long expectedVersion) {
        var current = findForCandidateById(candidateUserId, applicationId);
        if (current.isEmpty()) return Optional.empty();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        int updated = dsl.update(APPLICATIONS)
                .set(APPLICATIONS.STATUS, ApplicationStatus.WITHDRAWN.name())
                .set(APPLICATIONS.UPDATED_AT, now)
                .set(APPLICATIONS.VERSION, APPLICATIONS.VERSION.plus(1L))
                .where(APPLICATIONS.ID.eq(applicationId))
                .and(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(APPLICATIONS.STATUS.in(ApplicationStatus.SUBMITTED.name(),
                        ApplicationStatus.UNDER_REVIEW.name(), ApplicationStatus.SHORTLISTED.name()))
                .and(APPLICATIONS.VERSION.eq(expectedVersion))
                .execute();
        if (updated != 1) return Optional.empty();
        history(internalId(applicationId), current.get().status(), ApplicationStatus.WITHDRAWN,
                candidateUserId, reason, now);
        revokeGrant(applicationId, now);
        return findForCandidateById(candidateUserId, applicationId);
    }

    @Override
    public boolean revokeCvAccess(Long candidateUserId, Long applicationId, long expectedVersion) {
        var row = dsl.selectFrom(APPLICATIONS).where(APPLICATIONS.ID.eq(applicationId))
                .and(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId)).forUpdate().fetchOne();
        if (row == null) return false;
        var grant = dsl.selectFrom(APPLICATION_CV_ACCESS_GRANTS).where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(row.getId())).fetchOne();
        if (grant != null && grant.getRevokedAt() != null) return true;
        if (row.getVersion() != expectedVersion) return false;
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        revokeGrant(applicationId, now);
        dsl.update(APPLICATIONS).set(APPLICATIONS.VERSION, APPLICATIONS.VERSION.plus(1L))
                .set(APPLICATIONS.UPDATED_AT, now).where(APPLICATIONS.ID.eq(row.getId())).execute();
        return true;
    }

    private void revokeGrant(Long applicationId, OffsetDateTime now) {
        dsl.update(APPLICATION_CV_ACCESS_GRANTS).set(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT, now)
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(internalId(applicationId)))
                .and(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT.isNull()).execute();
        dsl.update(APPLICATIONS).set(APPLICATIONS.COVER_LETTER, (String) null)
                .where(APPLICATIONS.ID.eq(applicationId)).execute();
        dsl.deleteFrom(APPLICATION_MATCHING_PROJECTIONS).where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(applicationId)).execute();
    }

    @Override
    public List<ApplicationStatusChange> findHistoryForViewer(Long viewerUserId, Long applicationId) {
        boolean canView = dsl.fetchExists(dsl.selectOne().from(APPLICATIONS)
                .leftJoin(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID)
                        .and(COMPANY_MEMBERS.USER_ID.eq(viewerUserId))
                        .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")))
                .where(APPLICATIONS.ID.eq(applicationId))
                .and(APPLICATIONS.CANDIDATE_USER_ID.eq(viewerUserId).or(COMPANY_MEMBERS.ID.isNotNull())));
        if (!canView) return List.of();
        Long applicationInternalId = internalId(applicationId);
        if (applicationInternalId == null) return List.of();
        return dsl.selectFrom(APPLICATION_STATUS_HISTORY)
                .where(APPLICATION_STATUS_HISTORY.APPLICATION_ID.eq(applicationInternalId))
                .orderBy(APPLICATION_STATUS_HISTORY.OCCURRED_AT.asc())
                .fetch(record -> new ApplicationStatusChange(
                        record.getId(),
                        record.getFromStatus() == null ? null : ApplicationStatus.valueOf(record.getFromStatus()),
                        ApplicationStatus.valueOf(record.getToStatus()),
                        record.getActorUserId(), record.getReason(), record.getOccurredAt()));
    }

    @Override
    public Optional<ApplicationCvSnapshot> findCvSnapshotForRecruiter(Long recruiterUserId, Long applicationId) {
        return dsl.select(CV_VERSIONS.ID, CV_VERSIONS.OBJECT_BUCKET,
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
                .join(CVS).on(CVS.ID.eq(APPLICATIONS.CV_ID))
                .where(APPLICATIONS.ID.eq(applicationId))
                .and(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT.isNull())
                .and(APPLICATIONS.STATUS.ne("WITHDRAWN"))
                .and(CVS.STATUS.ne("DELETED"))
                .and(CV_VERSIONS.PROCESSING_STATUS.ne("DELETED"))
                .and(CANDIDATE_CONSENTS.REVOKED_AT.isNull())
                .fetchOptional(record -> new ApplicationCvSnapshot(record.get(CV_VERSIONS.ID),
                        record.get(CV_VERSIONS.OBJECT_BUCKET), record.get(CV_VERSIONS.OBJECT_KEY),
                        record.get(CV_VERSIONS.ORIGINAL_FILENAME), record.get(CV_VERSIONS.SIZE_BYTES)));
    }

    private org.jooq.SelectJoinStep<org.jooq.Record> applicationQuery() {
        return dsl.select(APPLICATIONS.fields()).select(COMPANIES.ID, JOBS.ID,
                        JOB_VERSIONS.ID, JOB_VERSIONS.MATCHING_DOMAIN, cvAccessGranted().as("cv_access_granted"), CVS.ID, CV_VERSIONS.ID)
                .from(APPLICATIONS).join(COMPANIES).on(COMPANIES.ID.eq(APPLICATIONS.COMPANY_ID))
                .join(JOBS).on(JOBS.ID.eq(APPLICATIONS.JOB_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(APPLICATIONS.JOB_VERSION_ID))
                .join(CVS).on(CVS.ID.eq(APPLICATIONS.CV_ID))
                .join(CV_VERSIONS).on(CV_VERSIONS.ID.eq(APPLICATIONS.CV_VERSION_ID));
    }

    private Optional<Application> findForCandidateById(Long candidateUserId, Long applicationId) {
        return applicationQuery().where(APPLICATIONS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(APPLICATIONS.ID.eq(applicationId)).fetchOptional(this::toDomain);
    }

    private Optional<ApplicationSubmission> findReplay(Long candidateUserId, String idempotencyKeyHash,
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

    private Optional<Application> findForReviewer(Long recruiterUserId, Long applicationId) {
        return applicationQuery().join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(recruiterUserId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANY_MEMBERS.ROLE.in("OWNER", "COMPANY_ADMIN", "RECRUITER"))
                .and(APPLICATIONS.ID.eq(applicationId)).fetchOptional(this::toDomain);
    }

    private Long internalId(Long applicationId) {
        return dsl.select(APPLICATIONS.ID).from(APPLICATIONS)
                .where(APPLICATIONS.ID.eq(applicationId)).fetchOne(APPLICATIONS.ID);
    }

    private Long consentId(Long candidateUserId, String policyVersion, OffsetDateTime now) {
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

                .set(CANDIDATE_CONSENTS.CANDIDATE_USER_ID, candidateUserId)
                .set(CANDIDATE_CONSENTS.CONSENT_TYPE, "CV_SHARING")
                .set(CANDIDATE_CONSENTS.POLICY_VERSION, policyVersion)
                .set(CANDIDATE_CONSENTS.ACCEPTED_AT, now)
                .returning().fetchOne();
        if (record == null) throw new IllegalStateException("Consent was not saved");
        return record.getId();
    }

    private void history(Long applicationId, ApplicationStatus from, ApplicationStatus to, Long actor,
                         String reason, OffsetDateTime now) {
        dsl.insertInto(APPLICATION_STATUS_HISTORY)

                .set(APPLICATION_STATUS_HISTORY.APPLICATION_ID, applicationId)
                .set(APPLICATION_STATUS_HISTORY.FROM_STATUS, from == null ? null : from.name())
                .set(APPLICATION_STATUS_HISTORY.TO_STATUS, to.name())
                .set(APPLICATION_STATUS_HISTORY.ACTOR_USER_ID, actor)
                .set(APPLICATION_STATUS_HISTORY.REASON, reason)
                .set(APPLICATION_STATUS_HISTORY.OCCURRED_AT, now).execute();
    }

    private org.jooq.Field<Boolean> cvAccessGranted() {
        return DSL.field(DSL.exists(dsl.selectOne().from(APPLICATION_CV_ACCESS_GRANTS)
                .join(CANDIDATE_CONSENTS).on(CANDIDATE_CONSENTS.ID.eq(APPLICATION_CV_ACCESS_GRANTS.CONSENT_ID))
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(APPLICATIONS.ID))
                .and(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT.isNull()).and(CANDIDATE_CONSENTS.REVOKED_AT.isNull()))
                .and(APPLICATIONS.STATUS.ne("WITHDRAWN")).and(CVS.STATUS.ne("DELETED")));
    }

    private Application toDomain(org.jooq.Record record) {
        return new Application(record.get(APPLICATIONS.ID), record.get(APPLICATIONS.CANDIDATE_USER_ID),
                record.get(COMPANIES.ID), record.get(CVS.ID), record.get(CV_VERSIONS.ID),
                record.get(JOBS.ID), record.get(JOB_VERSIONS.ID), record.get(APPLICATIONS.COVER_LETTER),
                ApplicationStatus.valueOf(record.get(APPLICATIONS.STATUS)),
                ApplicationSource.valueOf(record.get(APPLICATIONS.SOURCE)), record.get(APPLICATIONS.APPLIED_AT),
                record.get(APPLICATIONS.UPDATED_AT), record.get(APPLICATIONS.VERSION), "IT".equals(record.get(JOB_VERSIONS.MATCHING_DOMAIN)), record.get("cv_access_granted", Boolean.class));
    }
}
