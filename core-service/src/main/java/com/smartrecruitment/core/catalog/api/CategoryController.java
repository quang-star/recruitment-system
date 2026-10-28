package com.smartrecruitment.core.catalog.api;

import com.smartrecruitment.core.catalog.application.CategoryService;
import com.smartrecruitment.core.catalog.application.CategoryAuditSearch;
import com.smartrecruitment.core.catalog.application.port.CategoryRepository;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import com.smartrecruitment.core.shared.application.PageResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.time.OffsetDateTime;
import java.util.UUID;

@RestController
public class CategoryController {
    private final CategoryService categories;
    public CategoryController(CategoryService categories) { this.categories = categories; }

    @GetMapping("/api/v2/public/job-categories")
    public List<CategoryEntry> published() { return categories.list(false); }

    @GetMapping("/api/v2/dashboard/catalog")
    public List<CategoryEntry> adminList(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt); return categories.list(true);
    }
    @PostMapping("/api/v2/dashboard/catalog")
    public CategoryEntry create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateCategory request,
                                HttpServletRequest servletRequest) {
        return categories.create(requireAdmin(jwt), request.kind(), request.parentId(), request.name(), request.reason(),
                UUID.fromString(CorrelationIdFilter.current(servletRequest)));
    }
    @PutMapping("/api/v2/dashboard/catalog/{id}")
    public CategoryEntry act(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody CategoryAction request,
                             HttpServletRequest servletRequest) {
        return categories.act(requireAdmin(jwt), id, request.version(), request.action(), request.name(), request.mergeTargetId(),
                request.reason(), UUID.fromString(CorrelationIdFilter.current(servletRequest)));
    }
    @GetMapping("/api/v2/dashboard/catalog/{id}/history")
    public List<CategoryRepository.CategoryChange> history(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        requireAdmin(jwt); return categories.history(id);
    }
    @GetMapping("/api/v2/dashboard/catalog/history")
    public PageResult<CategoryRepository.CategoryChange> searchHistory(
            @AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size, @RequestParam(required = false) Long actorUserId,
            @RequestParam(required = false) Long resourceId, @RequestParam(required = false) String action,
            @RequestParam(required = false) UUID correlationId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) {
        requireAdmin(jwt);
        return categories.searchHistory(new CategoryAuditSearch(page, size, actorUserId, resourceId, action, correlationId, from, to));
    }
    public record CreateCategory(@NotNull CategoryKind kind, Long parentId, @NotBlank @Size(max=160) String name,
                                 @NotBlank @Size(max=1000) String reason) {
        public CreateCategory { reason = reason == null ? null : reason.strip(); }
    }
    public record CategoryAction(@NotNull @Min(0) Long version,
                                 @NotBlank @Pattern(regexp="APPROVE|EDIT|MERGE|REJECT|DEFER|REOPEN") String action,
                                 @Size(max=160) String name, Long mergeTargetId,
                                 @NotBlank @Size(max=1000) String reason) {
        public CategoryAction { reason = reason == null ? null : reason.strip(); }
    }
    private Long requireAdmin(Jwt jwt) {
        List<String> roles = jwt == null ? null : jwt.getClaimAsStringList("roles");
        if (roles == null || !roles.contains("SYSTEM_ADMIN")) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        return com.smartrecruitment.core.shared.api.SubjectId.parse(jwt.getSubject());
    }
}
