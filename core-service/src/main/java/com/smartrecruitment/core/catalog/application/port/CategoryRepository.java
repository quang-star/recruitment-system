package com.smartrecruitment.core.catalog.application.port;

import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.catalog.application.CategoryAuditSearch;
import com.smartrecruitment.core.shared.application.PageResult;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository {
    List<CategoryEntry> list(boolean includeInactive);
    Optional<CategoryEntry> find(Long id);
    Optional<CategoryEntry> findByName(CategoryKind kind, Long parentId, String normalizedName);
    CategoryEntry insert(CategoryEntry entry, String normalizedName, Long actor, String reason, UUID correlationId);
    boolean update(CategoryEntry before, CategoryEntry after, String normalizedName, Long actor, String action,
                   String reason, UUID correlationId);
    List<CategoryChange> history(Long categoryId);
    PageResult<CategoryChange> searchHistory(CategoryAuditSearch search);

    record CategoryChange(long id, Long resourceId, Long actorUserId, String action, String beforeState, String afterState,
                          java.time.OffsetDateTime occurredAt, String reason, UUID correlationId, Long version) { }
}
