package com.smartrecruitment.core.job.api.dto;

import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record JobResponse(Long jobId, Long companyId, Long createdByUserId, String status,
                          OffsetDateTime publishedAt, OffsetDateTime closedAt, long version,
                          Long jobVersionId, int jobVersionNumber, String title, String description,
                          String requirementsText, String benefitsText, String locationText, String countryCode,
                          String workMode, String employmentType, String seniorityLevel, int openings,
                          BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                          boolean salaryNegotiable, OffsetDateTime applicationDeadline, String sourceHash,
                          boolean externalAiConsent, String externalAiPolicyVersion,
                          com.smartrecruitment.core.job.domain.JobCategorySnapshot category, boolean matchingSupported) {
    public static JobResponse from(Job job) {
        JobVersion v = job.activeVersion();
        return new JobResponse(job.id(), job.companyId(), job.createdByUserId(), job.status().name(),
                job.publishedAt(), job.closedAt(), job.version(), v.id(), v.versionNumber(), v.title(),
                v.description(), v.requirementsText(), v.benefitsText(), v.locationText(), v.countryCode(),
                v.workMode() == null ? null : v.workMode().name(),
                v.employmentType() == null ? null : v.employmentType().name(), v.seniorityLevel(), v.openings(),
                v.salaryMin(), v.salaryMax(), v.salaryCurrency(), v.salaryPeriod(), v.salaryNegotiable(),
                v.applicationDeadline(), v.sourceHash(), v.externalAiConsent().granted(), v.externalAiConsent().policyVersion(), v.category(), v.category().supportsMatching());
    }
}
