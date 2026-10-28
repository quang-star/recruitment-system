package com.smartrecruitment.core.catalog.domain;


public record CategoryEntry(Long id, CategoryKind kind, Long parentId, String name, String status,
                            Long mergedIntoId, long version) {
    public static final Long IT_INDUSTRY_ID = 1L;
}
