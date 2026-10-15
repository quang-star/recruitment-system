package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.shared.domain.ExternalAiConsent;
import com.smartrecruitment.core.catalog.application.CategoryService;
import com.smartrecruitment.core.catalog.domain.CategoryChoice;
import com.smartrecruitment.core.job.domain.JobCategorySnapshot;

import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.job.application.port.JobRepository;
import com.smartrecruitment.core.job.domain.EmploymentType;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobStatus;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.domain.WorkMode;
import com.smartrecruitment.core.recruiter.application.CompanyNotFoundException;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class JobService {
    private final JobRepository jobs;
    private final CompanyRepository companies;
    private final ObjectStorage storage;
    private final OutboxEventRepository outbox;
    private final ObjectMapper objectMapper;
    private final String storageBucket;
    private final CategoryService categories;

    public JobService(JobRepository jobs, CompanyRepository companies) {
        this(jobs, companies, null, null, null, "smart-recruitment-cv");
    }

    public JobService(JobRepository jobs, CompanyRepository companies, ObjectStorage storage,
                      OutboxEventRepository outbox, ObjectMapper objectMapper,
                      @Value("${core.storage.bucket:smart-recruitment-cv}") String storageBucket) {
        this(jobs, companies, storage, outbox, objectMapper, storageBucket, null);
    }

    @Autowired
    public JobService(JobRepository jobs, CompanyRepository companies, ObjectStorage storage,
                      OutboxEventRepository outbox, ObjectMapper objectMapper,
                      @Value("${core.storage.bucket:smart-recruitment-cv}") String storageBucket, CategoryService categories) {
        this.categories = categories;
        this.jobs = jobs;
        this.companies = companies;
        this.storage = storage;
        this.outbox = outbox;
        this.objectMapper = objectMapper;
        this.storageBucket = storageBucket;
    }

    @Transactional
    public Job create(UUID userId, UUID companyId, String title, String description, String requirementsText,
                      String benefitsText, String locationText, String countryCode, WorkMode workMode,
                      EmploymentType employmentType, String seniorityLevel, int openings,
                      BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                      boolean salaryNegotiable, OffsetDateTime applicationDeadline) {
        return create(userId, companyId, title, description, requirementsText, benefitsText, locationText,
                countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax,
                salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, UUID.randomUUID());
    }

    @Transactional
    public Job create(UUID userId, UUID companyId, String title, String description, String requirementsText,
                      String benefitsText, String locationText, String countryCode, WorkMode workMode,
                      EmploymentType employmentType, String seniorityLevel, int openings,
                      BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                      boolean salaryNegotiable, OffsetDateTime applicationDeadline, UUID correlationId) {
        return create(userId, companyId, title, description, requirementsText, benefitsText, locationText,
                countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax,
                salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, correlationId,
                ExternalAiConsent.declined());
    }

    @Transactional
    public Job create(UUID userId, UUID companyId, String title, String description, String requirementsText,
                      String benefitsText, String locationText, String countryCode, WorkMode workMode,
                      EmploymentType employmentType, String seniorityLevel, int openings,
                      BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                      boolean salaryNegotiable, OffsetDateTime applicationDeadline, UUID correlationId, ExternalAiConsent consent) {
        return create(userId, companyId, title, description, requirementsText, benefitsText, locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, correlationId, consent, null);
    }

    @Transactional
    public Job create(UUID userId, UUID companyId, String title, String description, String requirementsText,
                      String benefitsText, String locationText, String countryCode, WorkMode workMode,
                      EmploymentType employmentType, String seniorityLevel, int openings,
                      BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                      boolean salaryNegotiable, OffsetDateTime applicationDeadline, UUID correlationId, ExternalAiConsent consent, CategoryChoice categoryChoice) {
        if (!companies.canRecruit(companyId, userId)) throw new CompanyNotFoundException();
        JobVersion version = version(1, userId, title, description, requirementsText, benefitsText, locationText,
                countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax,
                salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, consent, resolveCategory(userId, categoryChoice, title));
        Job saved = jobs.insert(Job.draft(companyId, userId, version));
        submitForParsing(saved, correlationId);
        return saved;
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
        return updateDraft(userId, jobId, expectedVersion, title, description, requirementsText, benefitsText,
                locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin,
                salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, UUID.randomUUID());
    }

    @Transactional
    public Job updateDraft(UUID userId, UUID jobId, long expectedVersion, String title, String description,
                           String requirementsText, String benefitsText, String locationText, String countryCode,
                           WorkMode workMode, EmploymentType employmentType, String seniorityLevel, int openings,
                           BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                           boolean salaryNegotiable, OffsetDateTime applicationDeadline, UUID correlationId) {
        return updateDraft(userId, jobId, expectedVersion, title, description, requirementsText, benefitsText,
                locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin,
                salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, correlationId,
                ExternalAiConsent.declined());
    }

    @Transactional
    public Job updateDraft(UUID userId, UUID jobId, long expectedVersion, String title, String description,
                           String requirementsText, String benefitsText, String locationText, String countryCode,
                           WorkMode workMode, EmploymentType employmentType, String seniorityLevel, int openings,
                           BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                           boolean salaryNegotiable, OffsetDateTime applicationDeadline, UUID correlationId, ExternalAiConsent consent) {
        return updateDraft(userId, jobId, expectedVersion, title, description, requirementsText, benefitsText, locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, correlationId, consent, null);
    }

    @Transactional
    public Job updateDraft(UUID userId, UUID jobId, long expectedVersion, String title, String description,
                           String requirementsText, String benefitsText, String locationText, String countryCode,
                           WorkMode workMode, EmploymentType employmentType, String seniorityLevel, int openings,
                           BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                           boolean salaryNegotiable, OffsetDateTime applicationDeadline, UUID correlationId, ExternalAiConsent consent, CategoryChoice categoryChoice) {
        Job existing = getMine(userId, jobId);
        ensureCanRecruit(existing.companyId(), userId);
        if (existing.status() != JobStatus.DRAFT) {
            throw new JobStateException("Only draft jobs can be edited");
        }
        JobVersion newVersion = version(existing.activeVersion().versionNumber() + 1, userId, title, description,
                requirementsText, benefitsText, locationText, countryCode, workMode, employmentType, seniorityLevel,
                openings, salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, applicationDeadline, consent, resolveCategory(userId, categoryChoice, title));
        Job saved = jobs.updateDraft(existing, newVersion, expectedVersion, userId)
                .orElseThrow(JobConflictException::new);
        submitForParsing(saved, correlationId);
        return saved;
    }

    @Transactional
    public Job publish(UUID userId, UUID jobId, long expectedVersion) {
        Job existing = getMine(userId, jobId);
        ensureCanRecruit(existing.companyId(), userId);
        if (existing.status() != JobStatus.DRAFT) {
            throw new JobStateException("Only draft jobs can be published");
        }
        if (existing.activeVersion().category().supportsMatching() && !jobs.isParsedJdConfirmed(existing.activeVersion().publicId())) {
            throw new JobStateException("Parsed JD must be confirmed before publishing");
        }
        return jobs.publish(jobId, userId, expectedVersion, OffsetDateTime.now()).orElseThrow(JobConflictException::new);
    }

    @Transactional
    public Job close(UUID userId, UUID jobId, long expectedVersion) {
        Job existing = getMine(userId, jobId);
        ensureCanRecruit(existing.companyId(), userId);
        if (existing.status() != JobStatus.PUBLISHED) {
            throw new JobStateException("Only published jobs can be closed");
        }
        return jobs.close(jobId, userId, expectedVersion, OffsetDateTime.now()).orElseThrow(JobConflictException::new);
    }

    private JobVersion version(int number, UUID userId, String title, String description, String requirementsText,
                               String benefitsText, String locationText, String countryCode, WorkMode workMode,
                               EmploymentType employmentType, String seniorityLevel, int openings,
                               BigDecimal salaryMin, BigDecimal salaryMax, String salaryCurrency, String salaryPeriod,
                               boolean salaryNegotiable, OffsetDateTime deadline, ExternalAiConsent consent, JobCategorySnapshot category) {
        return new JobVersion(UUID.randomUUID(), number, title, description, requirementsText, benefitsText,
                locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin, salaryMax,
                salaryCurrency, salaryPeriod, salaryNegotiable, deadline, hash(title, description, requirementsText,
                benefitsText, locationText, countryCode, workMode, employmentType, seniorityLevel, openings, salaryMin,
                salaryMax, salaryCurrency, salaryPeriod, salaryNegotiable, deadline, category), userId, consent, category);
    }

    private JobCategorySnapshot resolveCategory(UUID actor, CategoryChoice choice, String title) {
        if (categories == null) {
            if (choice != null) throw new IllegalStateException("Category service is unavailable");
            return JobCategorySnapshot.legacyIt(title);
        }
        return categories.resolve(actor, choice, title);
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

    private void submitForParsing(Job job, UUID correlationId) {
        if (storage == null || outbox == null || objectMapper == null) return;
        if (correlationId == null) throw new IllegalArgumentException("Correlation ID is required");
        var version = job.activeVersion();
        if (!version.category().supportsMatching()) {
            outbox.append(JobVersionSubmittedEvent.from(job, "unsupported/" + version.publicId(), correlationId,
                    OffsetDateTime.now(ZoneOffset.UTC)));
            return;
        }
        String objectKey = "jobs/" + job.publicId() + "/" + version.publicId() + ".json";
        byte[] content;
        try {
            content = objectMapper.writeValueAsBytes(new Object() {
                public final String title = version.title();
                public final String description = version.description();
                public final String requirementsText = version.requirementsText();
                public final String sourceHash = version.sourceHash();
                public final JobCategorySnapshot category = version.category();
            });
        } catch (JacksonException exception) {
            throw new IllegalStateException("Could not serialize private JD snapshot", exception);
        }
        try {
            storage.put(objectKey, new ByteArrayInputStream(content), content.length, "application/json");
            outbox.append(JobVersionSubmittedEvent.from(job, storageBucket + "/" + objectKey,
                    correlationId, OffsetDateTime.now(ZoneOffset.UTC)));
        } catch (RuntimeException exception) {
            try { storage.delete(objectKey); } catch (RuntimeException ignored) { }
            throw exception;
        }
    }
}
