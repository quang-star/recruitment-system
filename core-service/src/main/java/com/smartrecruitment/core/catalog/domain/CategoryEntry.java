package com.smartrecruitment.core.catalog.domain;

import java.util.UUID;

public record CategoryEntry(UUID id, CategoryKind kind, UUID parentId, String name, String status,
                            UUID mergedIntoId, long version) {
    public static final UUID IT_INDUSTRY_ID = UUID.fromString("10000000-0000-4000-8000-000000000001");
}
