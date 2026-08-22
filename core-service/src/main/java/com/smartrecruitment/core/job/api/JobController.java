package com.smartrecruitment.core.job.api;

import com.smartrecruitment.core.job.api.dto.JobResponse;
import com.smartrecruitment.core.job.api.dto.PutJobRequest;
import com.smartrecruitment.core.job.application.JobService;
import jakarta.validation.Valid;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class JobController {
    private final JobService jobs;

    public JobController(JobService jobs) { this.jobs = jobs; }

    @PostMapping("/api/v1/companies/{companyId}/jobs")
    public JobResponse create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId,
                              @Valid @RequestBody PutJobRequest request) {
        return JobResponse.from(jobs.create(userId(jwt), companyId, request.title(), request.description(),
                request.requirementsText(), request.benefitsText(), request.locationText(), request.countryCode(),
                request.workMode(), request.employmentType(), request.seniorityLevel(), request.openings(),
                request.salaryMin(), request.salaryMax(), request.salaryCurrency(), request.salaryPeriod(),
                request.salaryNegotiable(), request.applicationDeadline()));
    }

    @GetMapping("/api/v1/companies/{companyId}/jobs")
    public List<JobResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId) {
        return jobs.findMine(userId(jwt), companyId).stream().map(JobResponse::from).toList();
    }

    @GetMapping("/api/v1/jobs/{jobId}")
    public JobResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID jobId) {
        return JobResponse.from(jobs.getMine(userId(jwt), jobId));
    }

    @GetMapping("/api/v1/candidate/jobs")
    public List<JobResponse> publishedJobs() {
        return jobs.findPublished().stream().map(JobResponse::from).toList();
    }

    @PutMapping("/api/v1/jobs/{jobId}")
    public JobResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID jobId,
                              @Valid @RequestBody PutJobRequest request) {
        if (request.version() == null) throw new IllegalArgumentException("version is required when updating a job");
        return JobResponse.from(jobs.updateDraft(userId(jwt), jobId, request.version(), request.title(),
                request.description(), request.requirementsText(), request.benefitsText(), request.locationText(),
                request.countryCode(), request.workMode(), request.employmentType(), request.seniorityLevel(),
                request.openings(), request.salaryMin(), request.salaryMax(), request.salaryCurrency(),
                request.salaryPeriod(), request.salaryNegotiable(), request.applicationDeadline()));
    }

    @PostMapping("/api/v1/jobs/{jobId}/publish")
    public JobResponse publish(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID jobId,
                               @RequestParam long version) {
        return JobResponse.from(jobs.publish(userId(jwt), jobId, version));
    }

    @PostMapping("/api/v1/jobs/{jobId}/close")
    public JobResponse close(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID jobId,
                             @RequestParam long version) {
        return JobResponse.from(jobs.close(userId(jwt), jobId, version));
    }

    private UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
