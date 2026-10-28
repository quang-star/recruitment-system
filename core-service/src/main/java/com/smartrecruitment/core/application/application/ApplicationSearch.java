package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.shared.application.PageRequest;
import java.util.Set;

public record ApplicationSearch(Integer page, Integer size, String q, String sort, ApplicationStatus status) {
    public ApplicationSearch {
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
