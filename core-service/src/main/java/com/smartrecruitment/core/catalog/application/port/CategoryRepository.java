package com.smartrecruitment.core.catalog.application.port;

import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CategoryRepository {
    List<CategoryEntry> list(boolean includeInactive);
    Optional<CategoryEntry> find(UUID id);
    Optional<CategoryEntry> findByName(CategoryKind kind, UUID parentId, String normalizedName);
    CategoryEntry insert(CategoryEntry entry, String normalizedName, UUID actor);
}
