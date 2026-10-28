package com.smartrecruitment.core.catalog.application;

import com.smartrecruitment.core.catalog.application.port.CategoryRepository;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.catalog.domain.CategoryChoice;
import com.smartrecruitment.core.job.domain.JobCategorySnapshot;
import com.smartrecruitment.core.shared.application.PageResult;
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

    @Transactional(readOnly = true)
    public List<CategoryRepository.CategoryChange> history(Long id) { return categories.history(id); }

    @Transactional(readOnly = true)
    public PageResult<CategoryRepository.CategoryChange> searchHistory(CategoryAuditSearch search) {
        return categories.searchHistory(search);
    }

    /** Called inside the Job transaction, after company membership has been checked. */
    @Transactional
    public JobCategorySnapshot resolve(Long actor, CategoryChoice choice, String title) {
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

    private static Long approvedId(CategoryEntry entry) { return "ACTIVE".equals(entry.status()) ? entry.id() : null; }

    @Transactional
    public CategoryEntry create(Long actor, CategoryKind kind, Long parentId, String name, String reason, UUID correlationId) {
        return insert(actor, kind, parentId, name, "ACTIVE", cleanReason(reason), correlationId);
    }

    @Transactional
    public CategoryEntry propose(Long actor, CategoryKind kind, Long parentId, String name) {
        String clean = cleanName(name);
        return categories.findByName(kind, parentId, normalize(clean))
                .orElseGet(() -> insert(actor, kind, parentId, clean, "PENDING",
                        "Đề xuất từ phân loại nghề do recruiter nhập cho Job.", null));
    }

    private CategoryEntry insert(Long actor, CategoryKind kind, Long parentId, String name, String status,
                                 String reason, UUID correlationId) {
        String clean = cleanName(name);
        validateParent(kind, parentId, "ACTIVE".equals(status));
        if (categories.findByName(kind, parentId, normalize(clean)).isPresent()) throw new CategoryConflictException();
        try {
            return categories.insert(new CategoryEntry(0L, kind, parentId, clean, status, null, 0),
                    normalize(clean), actor, reason, correlationId);
        } catch (DataIntegrityViolationException exception) { throw new CategoryConflictException(); }
    }

    @Transactional
    public CategoryEntry act(Long actor, Long id, long expectedVersion, String action, String name, Long mergeTargetId,
                             String reason, UUID correlationId) {
        String cleanReason = cleanReason(reason);
        CategoryEntry before = categories.find(id).orElseThrow(() -> new IllegalArgumentException("Danh mục không tồn tại"));
        if (before.version() != expectedVersion || !List.of("ACTIVE", "PENDING", "DEFERRED").contains(before.status())) throw new CategoryConflictException();
        String status = before.status();
        String clean = before.name();
        Long merged = null;
        switch (action) {
            case "EDIT" -> {
                if ("DEFERRED".equals(status)) throw new CategoryConflictException();
                clean = cleanName(name);
            }
            case "APPROVE" -> {
                if (!"PENDING".equals(status)) throw new CategoryConflictException();
                validateParent(before.kind(), before.parentId(), true);
                if (name != null) clean = cleanName(name);
                status = "ACTIVE";
            }
            case "REJECT" -> {
                if (!"PENDING".equals(status)) throw new CategoryConflictException();
                status = "REJECTED";
            }
            case "DEFER" -> {
                if (!"PENDING".equals(status)) throw new CategoryConflictException();
                status = "DEFERRED";
            }
            case "REOPEN" -> {
                if (!"DEFERRED".equals(status)) throw new CategoryConflictException();
                status = "PENDING";
            }
            case "MERGE" -> {
                if ("DEFERRED".equals(status)) throw new CategoryConflictException();
                CategoryEntry target = categories.find(mergeTargetId)
                        .orElseThrow(() -> new IllegalArgumentException("Danh mục đích không tồn tại"));
                if (before.id().equals(target.id()) || before.kind() != target.kind()
                        || !Objects.equals(canonicalId(before.parentId()), canonicalId(target.parentId())) || !"ACTIVE".equals(target.status())
                        || CategoryEntry.IT_INDUSTRY_ID.equals(before.id()) || CategoryEntry.IT_INDUSTRY_ID.equals(target.id())) {
                    throw new IllegalArgumentException("Chỉ gộp danh mục cùng cấp/cùng cha; không đổi phạm vi matching CNTT");
                }
                merged = target.id(); status = "MERGED";
            }
            default -> throw new IllegalArgumentException("Thao tác danh mục không hợp lệ");
        }
        CategoryEntry after = new CategoryEntry(id, before.kind(), before.parentId(), clean, status, merged, expectedVersion + 1);
        try {
            if (!categories.update(before, after, normalize(clean), actor, action, cleanReason, correlationId)) throw new CategoryConflictException();
        } catch (DataIntegrityViolationException exception) { throw new CategoryConflictException(); }
        return after;
    }

    public CategoryEntry active(Long id, CategoryKind kind, Long parentId) {
        CategoryEntry entry = categories.find(canonicalId(id)).orElseThrow(() -> new IllegalArgumentException("Danh mục không tồn tại"));
        Long parent = canonicalId(entry.parentId());
        if (!"ACTIVE".equals(entry.status()) || entry.kind() != kind || !Objects.equals(parent, parentId)) {
            throw new IllegalArgumentException("Danh mục không thuộc đúng cấp/nhóm đã chọn");
        }
        return new CategoryEntry(entry.id(), entry.kind(), parent, entry.name(), entry.status(), null, entry.version());
    }

    private Long canonicalId(Long id) {
        if (id == null) return null;
        var seen = new HashSet<Long>();
        CategoryEntry entry = categories.find(id).orElseThrow(() -> new IllegalArgumentException("Danh mục không tồn tại"));
        while ("MERGED".equals(entry.status())) {
            if (!seen.add(entry.id())) throw new CategoryConflictException();
            entry = categories.find(entry.mergedIntoId()).orElseThrow(CategoryConflictException::new);
        }
        return entry.id();
    }

    private void validateParent(CategoryKind kind, Long parentId, boolean requireActive) {
        if (kind == null) throw new IllegalArgumentException("Cấp danh mục là bắt buộc");
        if (kind == CategoryKind.INDUSTRY) {
            if (parentId != null) throw new IllegalArgumentException("Ngành không có danh mục cha");
            return;
        }
        CategoryEntry parent = categories.find(parentId).orElseThrow(() -> new IllegalArgumentException("Cần chọn danh mục cha"));
        CategoryKind required = kind == CategoryKind.SPECIALIZATION ? CategoryKind.INDUSTRY : CategoryKind.SPECIALIZATION;
        if (parent.kind() != required || !(requireActive ? "ACTIVE".equals(parent.status())
                : List.of("ACTIVE", "PENDING", "DEFERRED").contains(parent.status()))) {
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

    private static String cleanReason(String value) {
        String clean = value == null ? "" : value.strip();
        if (clean.isEmpty() || clean.length() > 1000) throw new IllegalArgumentException("Lý do cần từ 1 đến 1000 ký tự");
        return clean;
    }
}
