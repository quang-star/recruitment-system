package com.smartrecruitment.core.catalog.application;

import com.smartrecruitment.core.shared.application.PageRequest;

import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

public record CategoryAuditSearch(Integer page, Integer size, Long actorUserId, Long resourceId, String action,
                                  UUID correlationId, OffsetDateTime from, OffsetDateTime to) {
    public CategoryAuditSearch {
        page = page == null ? 0 : page;
        size = size == null ? 20 : size;
        new PageRequest(page, size);
        action = action == null || action.isBlank() ? null : action.strip().toUpperCase(Locale.ROOT);
        if (action != null && !Set.of("CREATE", "PROPOSE", "EDIT", "APPROVE", "MERGE", "REJECT", "DEFER", "REOPEN").contains(action))
            throw new IllegalArgumentException("Unknown category audit action");
        if (from != null && to != null && from.isAfter(to))
            throw new IllegalArgumentException("Audit time range must start before it ends");
    }

    public int offset() { return page * size; }
}
