package com.smartrecruitment.core.job.api;

import com.smartrecruitment.core.job.application.JobDiscovery;
import com.smartrecruitment.core.job.application.JobService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class JobDiscoveryController {
    private final JobService jobs;

    public JobDiscoveryController(JobService jobs) { this.jobs = jobs; }

    @GetMapping("/api/v2/public/jobs/discovery")
    public JobDiscovery discovery() { return jobs.publishedDiscovery(); }
}
