package com.smartrecruitment.core.job.infrastructure.persistence;

import com.smartrecruitment.core.shared.domain.ExternalAiConsent;
import com.smartrecruitment.core.job.domain.JobCategorySnapshot;

import com.smartrecruitment.core.job.application.JobSearch;
import com.smartrecruitment.core.job.application.port.JobRepository;
import com.smartrecruitment.core.job.domain.EmploymentType;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobStatus;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.domain.WorkMode;
import com.smartrecruitment.core.shared.application.PageResult;
import com.smartrecruitment.core.shared.infrastructure.SearchText;

import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.SortField;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;

@Repository
public class JooqJobRepository implements JobRepository {
    private final DSLContext dsl;

    public JooqJobRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Map<Long, Integer> publishedCountsByCompany() {
        return dsl.select(COMPANIES.ID, DSL.count()).from(JOBS)
                .join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(JOBS.ACTIVE_VERSION_ID))
                .where(JOBS.STATUS.eq("PUBLISHED"))
                .and(JOB_VERSIONS.APPLICATION_DEADLINE.isNull()
                        .or(JOB_VERSIONS.APPLICATION_DEADLINE.gt(OffsetDateTime.now(ZoneOffset.UTC))))
                .groupBy(COMPANIES.ID).fetchMap(COMPANIES.ID, DSL.count());
    }

    @Override
    public PageResult<Job> searchPublished(JobSearch search) {
        Condition visibility = JOBS.STATUS.eq(JobStatus.PUBLISHED.name())
                .and(JOB_VERSIONS.APPLICATION_DEADLINE.isNull()
                        .or(JOB_VERSIONS.APPLICATION_DEADLINE.gt(OffsetDateTime.now(ZoneOffset.UTC))));
        return search(search, visibility, JOBS.PUBLISHED_AT);
    }

    @Override
    public PageResult<Job> searchForMember(Long companyId, Long userId, JobSearch search) {
        Condition visibility = COMPANIES.ID.eq(companyId).and(DSL.exists(dsl.selectOne()
                .from(COMPANY_MEMBERS).where(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))));
        return search(search, visibility, JOBS.UPDATED_AT);
    }

    private PageResult<Job> search(JobSearch search, Condition visibility,
                                   org.jooq.Field<OffsetDateTime> timestamp) {
        Condition filters = visibility;
        if (!search.q().isEmpty()) filters = filters.and(SearchText.contains(JOB_VERSIONS.TITLE, search.q())
                .or(SearchText.contains(JOB_VERSIONS.INDUSTRY_NAME, search.q()))
                .or(SearchText.contains(JOB_VERSIONS.SPECIALIZATION_NAME, search.q()))
                .or(SearchText.contains(JOB_VERSIONS.POSITION_NAME, search.q()))
                .or(SearchText.contains(JOB_VERSIONS.DESCRIPTION, search.q()))
                .or(SearchText.contains(JOB_VERSIONS.REQUIREMENTS_TEXT, search.q()))
                .or(SearchText.contains(JOB_VERSIONS.LOCATION_TEXT, search.q()))
                .or(SearchText.contains(COMPANIES.DISPLAY_NAME, search.q()))
                .or(SearchText.contains(COMPANIES.LEGAL_NAME, search.q())));
        if (search.industryId() != null) filters = filters.and(categoryFilter(JOB_VERSIONS.INDUSTRY_ID, search.industryId()));
        if (search.specializationId() != null) filters = filters.and(categoryFilter(JOB_VERSIONS.SPECIALIZATION_ID, search.specializationId()));
        if (search.positionId() != null) filters = filters.and(categoryFilter(JOB_VERSIONS.POSITION_ID, search.positionId()));
        if (search.companyId() != null) filters = filters.and(COMPANIES.ID.eq(search.companyId()));
        if (search.jobId() != null) filters = filters.and(JOBS.ID.eq(search.jobId()));
        if (!search.location().isEmpty()) filters = filters.and(SearchText.contains(JOB_VERSIONS.LOCATION_TEXT, search.location()));
        if (search.workMode() != null) filters = filters.and(JOB_VERSIONS.WORK_MODE.eq(search.workMode().name()));
        if (search.status() != null) filters = filters.and(JOBS.STATUS.eq(search.status().name()));
        if (!search.seniority().isEmpty()) {
            Condition levels = DSL.falseCondition();
            for (String level : search.seniority().split("\\|")) {
                if (!level.isBlank()) levels = levels.or(SearchText.contains(JOB_VERSIONS.SENIORITY_LEVEL, level.strip()));
            }
            filters = filters.and(levels);
        }
        if (search.employmentType() != null) filters = filters.and(JOB_VERSIONS.EMPLOYMENT_TYPE.eq(search.employmentType().name()));
        if (search.minSalary() != null) {
            var min = BigDecimal.valueOf(search.minSalary());
            filters = filters.and(JOB_VERSIONS.SALARY_NEGOTIABLE.isTrue()
                    .or(JOB_VERSIONS.SALARY_MAX.ge(min))
                    .or(JOB_VERSIONS.SALARY_MAX.isNull().and(JOB_VERSIONS.SALARY_MIN.ge(min))));
        }
        if (search.maxSalary() != null) {
            var max = BigDecimal.valueOf(search.maxSalary());
            filters = filters.and(JOB_VERSIONS.SALARY_NEGOTIABLE.isTrue()
                    .or(JOB_VERSIONS.SALARY_MIN.le(max))
                    .or(JOB_VERSIONS.SALARY_MIN.isNull().and(JOB_VERSIONS.SALARY_MAX.le(max))));
        }
        var query = dsl.select(JOBS.fields()).select(JOB_VERSIONS.fields()).select(COMPANIES.ID)
                .from(JOBS).join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(JOBS.ACTIVE_VERSION_ID)).where(filters);
        long total = dsl.fetchCount(query);
        SortField<?> order = switch (search.sort()) {
            case "oldest" -> timestamp.asc().nullsLast();
            case "title" -> DSL.lower(JOB_VERSIONS.TITLE).asc();
            case "salary_desc" -> JOB_VERSIONS.SALARY_MAX.desc().nullsLast();
            default -> timestamp.desc().nullsLast();
        };
        var items = query.orderBy(order, JOBS.ID.asc()).limit(search.size()).offset(search.offset())
                .fetch(record -> toDomain(record.into(JOBS), record.into(JOB_VERSIONS), record.get(COMPANIES.ID)));
        return new PageResult<>(items, total, search.page(), search.size());
    }

    @Override
    public Job insert(Job job) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        Long companyInternalId = dsl.select(COMPANIES.ID).from(COMPANIES)
                .where(COMPANIES.ID.eq(job.companyId())).fetchOne(COMPANIES.ID);
        if (companyInternalId == null) throw new IllegalStateException("Company was not found");
        var jobRecord = dsl.insertInto(JOBS)

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
    public Optional<Job> findByIdForMember(Long jobId, Long userId) {
        return baseQuery(userId).and(JOBS.ID.eq(jobId)).fetchOptional(record -> {
            var jobRecord = record.into(JOBS);
            return toDomain(jobRecord, activeVersion(jobRecord.getActiveVersionId()), record.get(COMPANIES.ID));
        });
    }

    @Override
    public List<Job> findAllForMember(Long companyId, Long userId) {
        return baseQuery(userId).and(COMPANIES.ID.eq(companyId))
                .orderBy(JOBS.UPDATED_AT.desc())
                .fetch(record -> {
                    var jobRecord = record.into(JOBS);
                    return toDomain(jobRecord, activeVersion(jobRecord.getActiveVersionId()), companyId);
                });
    }

    @Override
    public List<Job> findPublished() {
        return dsl.select(JOBS.fields()).select(COMPANIES.ID)
                .from(JOBS).join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(JOBS.ACTIVE_VERSION_ID))
                .where(JOBS.STATUS.eq(JobStatus.PUBLISHED.name()))
                .and(JOB_VERSIONS.APPLICATION_DEADLINE.isNull()
                        .or(JOB_VERSIONS.APPLICATION_DEADLINE.gt(OffsetDateTime.now(ZoneOffset.UTC))))
                .orderBy(JOBS.PUBLISHED_AT.desc())
                .fetch(record -> {
                    var jobRecord = record.into(JOBS);
                    return toDomain(jobRecord, activeVersion(jobRecord.getActiveVersionId()), record.get(COMPANIES.ID));
                });
    }

    @Override
    public boolean isParsedJdConfirmed(Long jobVersionId) {
        return dsl.fetchExists(dsl.selectOne()
                .from(com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobProcessingProjections.JOB_PROCESSING_PROJECTIONS)
                .where(com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobProcessingProjections.JOB_PROCESSING_PROJECTIONS.JOB_VERSION_ID.eq(jobVersionId))
                .and(com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobProcessingProjections.JOB_PROCESSING_PROJECTIONS.STATUS.eq("CONFIRMED")));
    }

    @Override
    public Optional<Job> updateDraft(Job job, JobVersion newVersion, long expectedVersion, Long userId) {
        Long internalId = internalId(job.id());
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
        return findByIdForMember(job.id(), userId);
    }

    @Override
    public Optional<Job> publish(Long jobId, Long userId, long expectedVersion, OffsetDateTime publishedAt) {
        return changeLifecycle(jobId, userId, expectedVersion, JobStatus.DRAFT, JobStatus.PUBLISHED,
                publishedAt, null);
    }

    @Override
    public Optional<Job> close(Long jobId, Long userId, long expectedVersion, OffsetDateTime closedAt) {
        return changeLifecycle(jobId, userId, expectedVersion, JobStatus.PUBLISHED, JobStatus.CLOSED,
                null, closedAt);
    }

    private Optional<Job> changeLifecycle(Long jobId, Long userId, long expectedVersion, JobStatus from,
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
        return findByIdForMember(jobId, userId);
    }

    private org.jooq.SelectConditionStep<org.jooq.Record> baseQuery(Long userId) {
        return dsl.select(JOBS.fields()).select(COMPANIES.ID)
                .from(JOBS).join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(userId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"));
    }

    private Condition categoryFilter(org.jooq.Field<Long> field, Long id) {
        // Follow catalog merge aliases when filtering, without rewriting any JD snapshot.
        return DSL.condition("{0} in (with recursive category_ids(id) as ("
                + "select id from job_category_catalog where id = {1} "
                + "union select c.id from job_category_catalog c join category_ids d on c.merged_into_id = d.id) "
                + "select id from category_ids)", field, DSL.val(id));
    }

    private Long internalId(Long id) {
        return dsl.select(JOBS.ID).from(JOBS).where(JOBS.ID.eq(id)).fetchOne(JOBS.ID);
    }

    private Long internalIdForMember(Long id, Long userId) {
        return dsl.select(JOBS.ID).from(JOBS).join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(JOBS.ID.eq(id)).and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")).fetchOne(JOBS.ID);
    }

    private com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord insertVersion(
            Long jobId, JobVersion version) {
        return dsl.insertInto(JOB_VERSIONS)

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
                .set(JOB_VERSIONS.EXTERNAL_AI_CONSENT, version.externalAiConsent().granted())
                .set(JOB_VERSIONS.EXTERNAL_AI_POLICY_VERSION, version.externalAiConsent().policyVersion())
                .set(JOB_VERSIONS.INDUSTRY_ID, version.category().industryId())
                .set(JOB_VERSIONS.INDUSTRY_NAME, version.category().industryName())
                .set(JOB_VERSIONS.SPECIALIZATION_ID, version.category().specializationId())
                .set(JOB_VERSIONS.SPECIALIZATION_NAME, version.category().specializationName())
                .set(JOB_VERSIONS.POSITION_ID, version.category().positionId())
                .set(JOB_VERSIONS.POSITION_NAME, version.category().positionName())
                .set(JOB_VERSIONS.MATCHING_DOMAIN, version.category().matchingDomain().name())
                .set(JOB_VERSIONS.CREATED_BY_USER_ID, version.createdByUserId())
                .set(JOB_VERSIONS.CREATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .returning().fetchOne();
    }

    private com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord activeVersion(Long id) {
        return dsl.selectFrom(JOB_VERSIONS).where(JOB_VERSIONS.ID.eq(id)).fetchOne();
    }

    private Job toDomain(com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobsRecord job,
                         com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord version,
                         Long companyId) {
        return new Job(job.getId(), companyId, job.getCreatedByUserId(), JobStatus.valueOf(job.getStatus()),
                job.getPublishedAt(), job.getClosedAt(), job.getVersion(), toVersion(version));
    }

    private JobVersion toVersion(com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.JobVersionsRecord record) {
        return new JobVersion(record.getId(), record.getVersionNumber(), record.getTitle(), record.getDescription(),
                record.getRequirementsText(), record.getBenefitsText(), record.getLocationText(), record.getCountryCode(),
                enumValue(WorkMode.class, record.getWorkMode()), enumValue(EmploymentType.class, record.getEmploymentType()),
                record.getSeniorityLevel(), record.getOpenings(), record.getSalaryMin(), record.getSalaryMax(),
                record.getSalaryCurrency(), record.getSalaryPeriod(), record.getSalaryNegotiable(),
                record.getApplicationDeadline(), record.getSourceHash(), record.getCreatedByUserId(),
                new ExternalAiConsent(record.getExternalAiConsent(), record.getExternalAiPolicyVersion()),
                new JobCategorySnapshot(record.getIndustryId(), record.getIndustryName(), record.getSpecializationId(),
                        record.getSpecializationName(), record.getPositionId(), record.getPositionName(),
                        JobCategorySnapshot.MatchingDomain.valueOf(record.getMatchingDomain())));
    }

    private <T extends Enum<T>> T enumValue(Class<T> type, String value) {
        return value == null ? null : Enum.valueOf(type, value);
    }
}
