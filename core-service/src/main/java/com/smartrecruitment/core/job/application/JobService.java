package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.job.application.port.JobRepository;
import com.smartrecruitment.core.recruiter.application.CompanyNotFoundException;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.job.domain.EmploymentType;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.domain.WorkMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class JobService {
    private final JobRepository jobs;
    private final CompanyRepository companies;

    public JobService(JobRepository jobs, CompanyRepository companies) {
        this.jobs = jobs;
        this.companies = companies;
    }

    @Transactional
    public Job create(UUID userId, UUID companyId, String title, String description, String requirementsText,
                      String benefitsText, String locationText, String countryCode, WorkMode workMode,
                      EmploymentType employmentType, String seniorityLevel, int openings,
                      BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                      boolean salaryNegotiable, OffsetDateTime applicationDeadline) {
        if (!companies.canRecruit(companyId, userId)) throw new CompanyNotFoundException();
        JobVersion version = version(1, userId, title, description, requirementsText, benefitsText, locationText,
                countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax,
                salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline);
        return jobs.insert(Job.draft(companyId, userId, version));
    }

    @Transactional(readOnly = true)
    public List<Job> findMine(UUID userId, UUID companyId) { return jobs.findAllForMember(companyId, userId); }

    @Transactional(readOnly = true)
    public List<Job> findPublished() { return jobs.findPublished(); }

    @Transactional(readOnly = true)
    public Job getMine(UUID userId, UUID jobId) { return jobs.findByPublicIdForMember(jobId, userId).orElseThrow(JobNotFoundException::new); }

    @Transactional
    public Job updateDraft(UUID userId, UUID jobId, long expectedVersion, String title, String description,
                           String requirementsText, String benefitsText, String locationText, String countryCode,
                           WorkMode workMode, EmploymentType employmentType, String seniorityLevel, int openings,
                           BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                           boolean salaryNegotiable, OffsetDateTime applicationDeadline) {
        Job existing = getMine(userId, jobId);
        ensureCanRecruit(existing.companyId(), userId);
        if (existing.status() != com.smartrecruitment.core.job.domain.JobStatus.DRAFT) {
            throw new JobStateException("Only draft jobs can be edited");
        }
        JobVersion newVersion = version(existing.activeVersion().versionNumber() + 1, userId, title, description,
                requirementsText, benefitsText, locationText, countryCode, workMode, employmentType, seniorityLevel,
                openings, salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline);
        return jobs.updateDraft(existing, newVersion, expectedVersion, userId).orElseThrow(JobConflictException::new);
    }

    @Transactional
    public Job publish(UUID userId, UUID jobId, long expectedVersion) {
        Job existing = getMine(userId, jobId);
        ensureCanRecruit(existing.companyId(), userId);
        if (existing.status() != com.smartrecruitment.core.job.domain.JobStatus.DRAFT) {
            throw new JobStateException("Only draft jobs can be published");
        }
        if (!jobs.isParsedJdConfirmed(existing.activeVersion().publicId())) {
            throw new JobStateException("Parsed JD must be confirmed before publishing");
        }
        return jobs.publish(jobId, userId, expectedVersion, OffsetDateTime.now()).orElseThrow(JobConflictException::new);
    }

    @Transactional
    public Job close(UUID userId, UUID jobId, long expectedVersion) {
        Job existing = getMine(userId, jobId);
        ensureCanRecruit(existing.companyId(), userId);
        if (existing.status() != com.smartrecruitment.core.job.domain.JobStatus.PUBLISHED) {
            throw new JobStateException("Only published jobs can be closed");
        }
        return jobs.close(jobId, userId, expectedVersion, OffsetDateTime.now()).orElseThrow(JobConflictException::new);
    }

    private JobVersion version(int number, UUID userId, String title, String description, String requirementsText,
                               String benefitsText, String locationText, String countryCode, WorkMode workMode,
                               EmploymentType employmentType, String seniorityLevel, int openings,
                               BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                               boolean salaryNegotiable, OffsetDateTime deadline) {
        return new JobVersion(UUID.randomUUID(), number, title, description, requirementsText, benefitsText,
                locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax,
                salaryCurrency, salaryPeriod, salaryNegotiable, deadline, hash(title, description, requirementsText,
                benefitsText, locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin,
                salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, deadline), userId);
    }

    private void ensureCanRecruit(UUID companyId, UUID userId) {
        if (!companies.canRecruit(companyId, userId)) throw new CompanyNotFoundException();
    }

    private String hash(Object... values) {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            return java.util.HexFormat.of().formatHex(digest.digest(java.util.Arrays.deepToString(values).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
