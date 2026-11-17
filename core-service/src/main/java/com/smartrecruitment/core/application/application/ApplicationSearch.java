package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.shared.application.PageRequest;
import java.util.Set;

public record ApplicationSearch(Integer page, Integer size, String q, String sort, ApplicationStatus status, Long applicationId) {
    public ApplicationSearch(Integer page, Integer size, String q, String sort, ApplicationStatus status) {
        this(page, size, q, sort, status, null);
    }

    public ApplicationSearch {
        if (applicationId != null && applicationId <= 0) throw new IllegalArgumentException("Application ID must be positive");
        page = page == null ? 0 : page;
        size = size == null ? 10 : size;
        new PageRequest(page, size);
        q = PageRequest.text(q);
        sort = sort == null ? "newest" : sort;
        if (!Set.of("newest", "oldest", "score").contains(sort))
            throw new IllegalArgumentException("Application sort must be newest, oldest or score");
    }

    public int offset() { return page * size; }
}
