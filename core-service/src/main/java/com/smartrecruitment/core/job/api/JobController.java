package com.smartrecruitment.core.job.api;

import com.smartrecruitment.core.shared.domain.ExternalAiConsent;

import com.smartrecruitment.core.job.api.dto.JobResponse;
import com.smartrecruitment.core.job.api.dto.PutJobRequest;
import com.smartrecruitment.core.job.application.JobSearch;
import com.smartrecruitment.core.job.application.JobService;
import com.smartrecruitment.core.job.domain.EmploymentType;
import com.smartrecruitment.core.job.domain.JobStatus;
import com.smartrecruitment.core.job.domain.WorkMode;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import com.smartrecruitment.core.shared.application.PageResult;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class JobController {
    private final JobService jobs;

    public JobController(JobService jobs) { this.jobs = jobs; }

    @PostMapping("/api/v2/companies/{companyId}/jobs")
    public JobResponse create(@AuthenticationPrincipal Jwt jwt, HttpServletRequest servletRequest,
                              @PathVariable Long companyId,
                              @Valid @RequestBody PutJobRequest request) {
        return JobResponse.from(jobs.create(userId(jwt), companyId, request.title(), request.description(),
                request.requirementsText(), request.benefitsText(), request.locationText(), request.countryCode(),
                request.workMode(), request.employmentType(), request.seniorityLevel(), request.openings(),
                request.salaryMin(), request.salaryMax(), request.salaryCurrency(), request.salaryPeriod(),
                request.salaryNegotiable(), request.applicationDeadline(),
                UUID.fromString(CorrelationIdFilter.current(servletRequest)),
                ExternalAiConsent.fromChoice(request.externalAiConsent(), request.externalAiPolicyVersion()), request.category()));
    }

    @GetMapping(value = "/api/v2/companies/{companyId}/jobs", params = "!page")
    public List<JobResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId) {
        return jobs.findMine(userId(jwt), companyId).stream().map(JobResponse::from).toList();
    }

    @GetMapping("/api/v2/jobs/{jobId}")
    public JobResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long jobId) {
        return JobResponse.from(jobs.getMine(userId(jwt), jobId));
    }

    @GetMapping(value = {"/api/v2/candidate/jobs", "/api/v2/public/jobs"}, params = {"!page", "!summary"})
    public List<JobResponse> publishedJobs() {
        return jobs.findPublished().stream().map(JobResponse::from).toList();
    }

    @GetMapping(value = {"/api/v2/candidate/jobs", "/api/v2/public/jobs"}, params = {"summary", "!page"})
    public Map<Long, Integer> publishedCounts() { return jobs.publishedCountsByCompany(); }

    @GetMapping(value = {"/api/v2/candidate/jobs", "/api/v2/public/jobs"}, params = "page")
    public PageResult<JobResponse> searchPublished(
            @RequestParam int page, @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(required = false) Long jobId, @RequestParam(defaultValue = "") String location,
            @RequestParam(required = false) WorkMode workMode,
            @RequestParam(defaultValue = "") String seniority,
            @RequestParam(required = false) JobStatus status,
            @RequestParam(required = false) Long companyId,
            @RequestParam(required = false) Long industryId, @RequestParam(required = false) Long specializationId,
            @RequestParam(required = false) Long positionId,
            @RequestParam(required = false) EmploymentType employmentType,
            @RequestParam(required = false) Long minSalary,
            @RequestParam(required = false) Long maxSalary) {
        var search = new JobSearch(page, size, q, sort, companyId, jobId, location, workMode, seniority, status,
                industryId, specializationId, positionId, employmentType, minSalary, maxSalary);
        return jobs.searchPublished(search).map(JobResponse::from);
    }

    @GetMapping(value = "/api/v2/companies/{companyId}/jobs", params = "page")
    public PageResult<JobResponse> searchMine(
            @AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId,
            @RequestParam int page, @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(required = false) Long jobId, @RequestParam(defaultValue = "") String location,
            @RequestParam(required = false) WorkMode workMode,
            @RequestParam(defaultValue = "") String seniority,
            @RequestParam(required = false) JobStatus status,
            @RequestParam(required = false) Long industryId, @RequestParam(required = false) Long specializationId,
            @RequestParam(required = false) Long positionId,
            @RequestParam(required = false) EmploymentType employmentType,
            @RequestParam(required = false) Long minSalary,
            @RequestParam(required = false) Long maxSalary) {
        var search = new JobSearch(page, size, q, sort, companyId, jobId, location, workMode, seniority, status,
                industryId, specializationId, positionId, employmentType, minSalary, maxSalary);
        return jobs.searchMine(userId(jwt), companyId, search).map(JobResponse::from);
    }

    @PutMapping("/api/v2/jobs/{jobId}")
    public JobResponse update(@AuthenticationPrincipal Jwt jwt, HttpServletRequest servletRequest,
                              @PathVariable Long jobId,
                              @Valid @RequestBody PutJobRequest request) {
        if (request.version() == null) throw new IllegalArgumentException("version is required when updating a job");
        return JobResponse.from(jobs.updateDraft(userId(jwt), jobId, request.version(), request.title(),
                request.description(), request.requirementsText(), request.benefitsText(), request.locationText(),
                request.countryCode(), request.workMode(), request.employmentType(), request.seniorityLevel(),
                request.openings(), request.salaryMin(), request.salaryMax(), request.salaryCurrency(),
                request.salaryPeriod(), request.salaryNegotiable(), request.applicationDeadline(),
                UUID.fromString(CorrelationIdFilter.current(servletRequest)),
                ExternalAiConsent.fromChoice(request.externalAiConsent(), request.externalAiPolicyVersion()), request.category()));
    }

    @PostMapping("/api/v2/jobs/{jobId}/publish")
    public JobResponse publish(@AuthenticationPrincipal Jwt jwt, @PathVariable Long jobId,
                               @RequestParam long version) {
        return JobResponse.from(jobs.publish(userId(jwt), jobId, version));
    }

    @PostMapping("/api/v2/jobs/{jobId}/close")
    public JobResponse close(@AuthenticationPrincipal Jwt jwt, @PathVariable Long jobId,
                             @RequestParam long version) {
        return JobResponse.from(jobs.close(userId(jwt), jobId, version));
    }

    private Long userId(Jwt jwt) { return com.smartrecruitment.core.shared.api.SubjectId.parse(jwt.getSubject()); }
}
