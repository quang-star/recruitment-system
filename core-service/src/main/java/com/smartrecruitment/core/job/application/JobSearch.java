package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.job.domain.EmploymentType;
import com.smartrecruitment.core.job.domain.JobStatus;
import com.smartrecruitment.core.job.domain.WorkMode;
import com.smartrecruitment.core.shared.application.PageRequest;
import java.util.Set;

public record JobSearch(Integer page, Integer size, String q, String sort, Long companyId, Long jobId,
                        String location, WorkMode workMode, String seniority, JobStatus status,
                        Long industryId, Long specializationId, Long positionId,
                        EmploymentType employmentType, Long minSalary, Long maxSalary) {

    public JobSearch(Integer page, Integer size, String q, String sort, Long companyId, Long jobId,
                     String location, WorkMode workMode, String seniority, JobStatus status,
                     Long industryId, Long specializationId, Long positionId) {
        this(page, size, q, sort, companyId, jobId, location, workMode, seniority, status,
             industryId, specializationId, positionId, null, null, null);
    }

    public JobSearch(Integer page, Integer size, String q, String sort, Long companyId, Long jobId,
                     String location, WorkMode workMode, String seniority, JobStatus status) {
        this(page, size, q, sort, companyId, jobId, location, workMode, seniority, status,
             null, null, null, null, null, null);
    }

    public JobSearch {
        page = page == null ? 0 : page;
        size = size == null ? 12 : size;
        new PageRequest(page, size);
        q = PageRequest.text(q);
        location = PageRequest.text(location);
        seniority = PageRequest.text(seniority);
        sort = sort == null ? "newest" : sort;
        if (!Set.of("newest", "oldest", "title", "salary_desc").contains(sort))
            throw new IllegalArgumentException("Job sort must be newest, oldest, title or salary_desc");
        if (minSalary != null && minSalary < 0)
            throw new IllegalArgumentException("minSalary cannot be negative");
        if (maxSalary != null && maxSalary < 0)
            throw new IllegalArgumentException("maxSalary cannot be negative");
        if (minSalary != null && maxSalary != null && minSalary > maxSalary)
            throw new IllegalArgumentException("minSalary cannot be greater than maxSalary");
    }

    public int offset() { return page * size; }
}
