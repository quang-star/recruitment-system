package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.shared.application.PageRequest;

public record CompanyReviewSearch(int page, int size, String q, CompanyStatus status) {
    public CompanyReviewSearch {
        new PageRequest(page, size);
        q = PageRequest.text(q);
    }

    public int offset() { return page * size; }
}
