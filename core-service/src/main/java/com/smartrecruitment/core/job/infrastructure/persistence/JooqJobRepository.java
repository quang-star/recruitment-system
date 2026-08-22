package com.smartrecruitment.core.job.infrastructure.persistence;

import com.smartrecruitment.core.job.application.port.JobRepository;
import com.smartrecruitment.core.job.domain.EmploymentType;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobStatus;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.domain.WorkMode;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;

@Repository
public class JooqJobRepository implements JobRepository {
    private final DSLContext dsl;

    public JooqJobRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Job insert(Job job) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        Long companyInternalId = dsl.select(COMPANIES.ID).from(COMPANIES)
                .where(COMPANIES.PUBLIC_ID.eq(job.companyId())).fetchOne(COMPANIES.ID);
        if (companyInternalId == null) throw new IllegalStateException("Company was not found");
        var jobRecord = dsl.insertInto(JOBS)
                .set(JOBS.PUBLIC_ID, job.publicId())
                .set(JOBS.COMPANY_ID, companyInternalId)
                .set(JOBS.CREATED_BY_USER_ID, job.createdByUserId())
                .set(JOBS.STATUS, job.status().name())
                .set(JOBS.CREATED_AT, now)
                .set(JOBS.UPDATED_AT, now)
                .set(JOBS.VERSION, 0L)
                .returning().fetchOne();
        if (jobRecord == null) throw new IllegalStateException("Insert job returned no record");
        var versionRecord = insertVersion(jobRecord.getId(), job.activeVersion());
        dsl.update(JOBS).set(JOBS.ACTIVE_VERSION_ID, versionRecord.getId())
                .where(JOBS.ID.eq(jobRecord.getId())).execute();
        return toDomain(jobRecord, versionRecord, job.companyId());
    }

    @Override
    public Optional<Job> findByPublicIdForMember(UUID jobId, UUID userId) {
        return baseQuery(userId).and(JOBS.PUBLIC_ID.eq(jobId)).fetchOptional(record -> {
            var jobRecord = record.into(JOBS);
            return toDomain(jobRecord, activeVersion(jobRecord.getActiveVersionId()), record.get(COMPANIES.PUBLIC_ID));
        });
    }

    @Override
    public List<Job> findAllForMember(UUID companyId, UUID userId) {
        return baseQuery(userId).and(COMPANIES.PUBLIC_ID.eq(companyId))
                .orderBy(JOBS.UPDATED_AT.desc())
                .fetch(record -> {
                    var jobRecord = record.into(JOBS);
                    return toDomain(jobRecord, activeVersion(jobRecord.getActiveVersionId()), companyId);
                });
    }

    @Override
    public List<Job> findPublished() {
        return dsl.select(JOBS.fields()).select(COMPANIES.PUBLIC_ID)
                .from(JOBS).join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(JOBS.ACTIVE_VERSION_ID))
                .where(JOBS.STATUS.eq(JobStatus.PUBLISHED.name()))
                .and(JOB_VERSIONS.APPLICATION_DEADLINE.isNull()
                        .or(JOB_VERSIONS.APPLICATION_DEADLINE.gt(OffsetDateTime.now(ZoneOffset.UTC))))
                .orderBy(JOBS.PUBLISHED_AT.desc())
                .fetch(record -> {
                    var jobRecord = record.into(JOBS);
                    return toDomain(jobRecord, activeVersion(jobRecord.getActiveVersionId()), record.get(COMPANIES.PUBLIC_ID));
                });
    }

    @Override
    public Optional<Job> updateDraft(Job job, JobVersion newVersion, long expectedVersion, UUID userId) {
        Long internalId = internalId(job.publicId());
        if (internalId == null) return Optional.empty();
        var updated = dsl.update(JOBS)
                .set(JOBS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(JOBS.VERSION, JOBS.VERSION.plus(1L))
                .where(JOBS.ID.eq(internalId)).and(JOBS.STATUS.eq(JobStatus.DRAFT.name()))
                .and(JOBS.VERSION.eq(expectedVersion)).execute();
        if (updated != 1) return Optional.empty();
        var versionRecord = insertVersion(internalId, newVersion);
        dsl.update(JOBS).set(JOBS.ACTIVE_VERSION_ID, versionRecord.getId())
                .where(JOBS.ID.eq(internalId)).execute();
        return findByPublicIdForMember(job.publicId(), userId);
    }

    @Override
    public Optional<Job> publish(UUID jobId, UUID userId, long expectedVersion, OffsetDateTime publishedAt) {
        return changeLifecycle(jobId, userId, expectedVersion, JobStatus.DRAFT, JobStatus.PUBLISHED,
                publishedAt, null);
    }

    @Override
    public Optional<Job> close(UUID jobId, UUID userId, long expectedVersion, OffsetDateTime closedAt) {
        return changeLifecycle(jobId, userId, expectedVersion, JobStatus.PUBLISHED, JobStatus.CLOSED,
                null, closedAt);
    }

    private Optional<Job> changeLifecycle(UUID jobId, UUID userId, long expectedVersion, JobStatus from,
                                           JobStatus to, OffsetDateTime publishedAt, OffsetDateTime closedAt) {
        Long internalId = internalIdForMember(jobId, userId);
        if (internalId == null) return Optional.empty();
        var update = dsl.update(JOBS).set(JOBS.STATUS, to.name())
                .set(JOBS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(JOBS.VERSION, JOBS.VERSION.plus(1L))
                .set(JOBS.PUBLISHED_AT, publishedAt)
                .set(JOBS.CLOSED_AT, closedAt)
                .where(JOBS.ID.eq(internalId)).and(JOBS.STATUS.eq(from.name()))
                .and(JOBS.VERSION.eq(expectedVersion)).execute();
        if (update != 1) return Optional.empty();
        return findByPublicIdForMember(jobId, userId);
    }

    private org.jooq.SelectConditionStep<org.jooq.Record> baseQuery(UUID userId) {
        return dsl.select(JOBS.fields()).select(COMPANIES.PUBLIC_ID)
                .from(JOBS).join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(userId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"));
    }

    private Long internalId(UUID publicId) {
        return dsl.select(JOBS.ID).from(JOBS).where(JOBS.PUBLIC_ID.eq(publicId)).fetchOne(JOBS.ID);
    }

    private Long internalIdForMember(UUID publicId, UUID userId) {
        return dsl.select(JOBS.ID).from(JOBS).join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(JOBS.PUBLIC_ID.eq(publicId)).and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")).fetchOne(JOBS.ID);
    }

    private com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord insertVersion(
            Long jobId, JobVersion version) {
        return dsl.insertInto(JOB_VERSIONS)
                .set(JOB_VERSIONS.PUBLIC_ID, version.publicId())
                .set(JOB_VERSIONS.JOB_ID, jobId)
                .set(JOB_VERSIONS.VERSION_NUMBER, version.versionNumber())
                .set(JOB_VERSIONS.TITLE, version.title())
                .set(JOB_VERSIONS.DESCRIPTION, version.description())
                .set(JOB_VERSIONS.REQUIREMENTS_TEXT, version.requirementsText())
                .set(JOB_VERSIONS.BENEFITS_TEXT, version.benefitsText())
                .set(JOB_VERSIONS.LOCATION_TEXT, version.locationText())
                .set(JOB_VERSIONS.COUNTRY_CODE, version.countryCode())
                .set(JOB_VERSIONS.WORK_MODE, version.workMode() == null ? null : version.workMode().name())
                .set(JOB_VERSIONS.EMPLOYMENT_TYPE, version.employmentType() == null ? null : version.employmentType().name())
                .set(JOB_VERSIONS.SENIORITY_LEVEL, version.seniorityLevel())
                .set(JOB_VERSIONS.OPENINGS, version.openings())
                .set(JOB_VERSIONS.SALARY_MIN, version.salaryMin())
                .set(JOB_VERSIONS.SALARY_MAX, version.salaryMax())
                .set(JOB_VERSIONS.SALARY_CURRENCY, version.salaryCurrency())
                .set(JOB_VERSIONS.SALARY_PERIOD, version.salaryPeriod())
                .set(JOB_VERSIONS.SALARY_NEGOTIABLE, version.salaryNegotiable())
                .set(JOB_VERSIONS.APPLICATION_DEADLINE, version.applicationDeadline())
                .set(JOB_VERSIONS.SOURCE_HASH, version.sourceHash())
                .set(JOB_VERSIONS.CREATED_BY_USER_ID, version.createdByUserId())
                .set(JOB_VERSIONS.CREATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .returning().fetchOne();
    }

    private com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord activeVersion(Long id) {
        return dsl.selectFrom(JOB_VERSIONS).where(JOB_VERSIONS.ID.eq(id)).fetchOne();
    }

    private Job toDomain(com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobsRecord job,
                         com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord version,
                         UUID companyId) {
        return new Job(job.getPublicId(), companyId, job.getCreatedByUserId(), JobStatus.valueOf(job.getStatus()),
                job.getPublishedAt(), job.getClosedAt(), job.getVersion(), toVersion(version));
    }

    private JobVersion toVersion(com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord record) {
        return new JobVersion(record.getPublicId(), record.getVersionNumber(), record.getTitle(), record.getDescription(),
                record.getRequirementsText(), record.getBenefitsText(), record.getLocationText(), record.getCountryCode(),
                enumValue(WorkMode.class, record.getWorkMode()), enumValue(EmploymentType.class, record.getEmploymentType()),
                record.getSeniorityLevel(), record.getOpenings(), record.getSalaryMin(), record.getSalaryMax(),
                record.getSalaryCurrency(), record.getSalaryPeriod(), record.getSalaryNegotiable(),
                record.getApplicationDeadline(), record.getSourceHash(), record.getCreatedByUserId());
    }

    private <T extends Enum<T>> T enumValue(Class<T> type, String value) {
        return value == null ? null : Enum.valueOf(type, value);
    }
}
