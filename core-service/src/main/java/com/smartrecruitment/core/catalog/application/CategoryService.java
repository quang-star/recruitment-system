package com.smartrecruitment.core.catalog.application;

import com.smartrecruitment.core.catalog.application.port.CategoryRepository;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.catalog.domain.CategoryChoice;
import com.smartrecruitment.core.job.domain.JobCategorySnapshot;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.List;
import java.util.HashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

@Service
public class CategoryService {
    private final CategoryRepository categories;
    public CategoryService(CategoryRepository categories) { this.categories = categories; }

    @Transactional(readOnly = true)
    public List<CategoryEntry> list(boolean includeInactive) {
        List<CategoryEntry> entries = categories.list(includeInactive);
        if (includeInactive) return entries;
        return entries.stream().map(entry -> new CategoryEntry(entry.id(), entry.kind(), canonicalId(entry.parentId()),
                entry.name(), entry.status(), entry.mergedIntoId(), entry.version())).toList();
    }

    /** Called inside the Job transaction, after company membership has been checked. */
    @Transactional
    public JobCategorySnapshot resolve(UUID actor, CategoryChoice choice, String title) {
        if (choice == null) return JobCategorySnapshot.legacyIt(title);
        CategoryEntry industry = choice.industryId() != null ? active(choice.industryId(), CategoryKind.INDUSTRY, null)
                : propose(actor, CategoryKind.INDUSTRY, null, choice.industryName());
        CategoryEntry specialization = choice.specializationId() != null
                ? active(choice.specializationId(), CategoryKind.SPECIALIZATION, industry.id())
                : propose(actor, CategoryKind.SPECIALIZATION, industry.id(),
                    choice.specializationName() == null || choice.specializationName().isBlank() ? "Khác" : choice.specializationName());
        CategoryEntry position = choice.positionId() != null ? active(choice.positionId(), CategoryKind.POSITION, specialization.id())
                : propose(actor, CategoryKind.POSITION, specialization.id(), choice.positionName());
        boolean it = CategoryEntry.IT_INDUSTRY_ID.equals(industry.id());
        return new JobCategorySnapshot(approvedId(industry), industry.name(), approvedId(specialization), specialization.name(),
                approvedId(position), position.name(), it ? JobCategorySnapshot.MatchingDomain.IT : JobCategorySnapshot.MatchingDomain.OUTSIDE_IT);
    }

    private static UUID approvedId(CategoryEntry entry) { return "ACTIVE".equals(entry.status()) ? entry.id() : null; }

    @Transactional
    public CategoryEntry propose(UUID actor, CategoryKind kind, UUID parentId, String name) {
        String clean = cleanName(name);
        return categories.findByName(kind, parentId, normalize(clean))
                .orElseGet(() -> insert(actor, kind, parentId, clean, "PENDING"));
    }

    private CategoryEntry insert(UUID actor, CategoryKind kind, UUID parentId, String name, String status) {
        String clean = cleanName(name);
        validateParent(kind, parentId, "ACTIVE".equals(status));
        if (categories.findByName(kind, parentId, normalize(clean)).isPresent()) throw new CategoryConflictException();
        try {
            return categories.insert(new CategoryEntry(UUID.randomUUID(), kind, parentId, clean, status, null, 0),
                    normalize(clean), actor);
        } catch (DataIntegrityViolationException exception) { throw new CategoryConflictException(); }
    }

    public CategoryEntry active(UUID id, CategoryKind kind, UUID parentId) {
        CategoryEntry entry = categories.find(canonicalId(id)).orElseThrow(() -> new IllegalArgumentException("Danh mục không tồn tại"));
        UUID parent = canonicalId(entry.parentId());
        if (!"ACTIVE".equals(entry.status()) || entry.kind() != kind || !Objects.equals(parent, parentId)) {
            throw new IllegalArgumentException("Danh mục không thuộc đúng cấp/nhóm đã chọn");
        }
        return new CategoryEntry(entry.id(), entry.kind(), parent, entry.name(), entry.status(), null, entry.version());
    }

    private UUID canonicalId(UUID id) {
        if (id == null) return null;
        var seen = new HashSet<UUID>();
        CategoryEntry entry = categories.find(id).orElseThrow(() -> new IllegalArgumentException("Danh mục không tồn tại"));
        while ("MERGED".equals(entry.status())) {
            if (!seen.add(entry.id())) throw new CategoryConflictException();
            entry = categories.find(entry.mergedIntoId()).orElseThrow(CategoryConflictException::new);
        }
        return entry.id();
    }

    private void validateParent(CategoryKind kind, UUID parentId, boolean requireActive) {
        if (kind == null) throw new IllegalArgumentException("Cấp danh mục là bắt buộc");
        if (kind == CategoryKind.INDUSTRY) {
            if (parentId != null) throw new IllegalArgumentException("Ngành không có danh mục cha");
            return;
        }
        CategoryEntry parent = categories.find(parentId).orElseThrow(() -> new IllegalArgumentException("Cần chọn danh mục cha"));
        CategoryKind required = kind == CategoryKind.SPECIALIZATION ? CategoryKind.INDUSTRY : CategoryKind.SPECIALIZATION;
        if (parent.kind() != required || !(requireActive ? "ACTIVE".equals(parent.status())
                : List.of("ACTIVE", "PENDING").contains(parent.status()))) {
            throw new IllegalArgumentException("Danh mục cha chưa được duyệt hoặc sai cấp");
        }
    }

    private static String cleanName(String value) {
        if (value == null) throw new IllegalArgumentException("Tên danh mục là bắt buộc");
        String clean = Normalizer.normalize(value, Normalizer.Form.NFKC).trim().replaceAll("\\s+", " ");
        if (clean.isEmpty() || clean.length() > 160) throw new IllegalArgumentException("Tên danh mục cần từ 1 đến 160 ký tự");
        return clean;
    }
    private static String normalize(String value) { return value.toLowerCase(Locale.ROOT); }

}
