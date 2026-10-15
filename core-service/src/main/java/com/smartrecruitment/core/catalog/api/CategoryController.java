package com.smartrecruitment.core.catalog.api;

import com.smartrecruitment.core.catalog.application.CategoryService;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.UUID;

@RestController
public class CategoryController {
    private final CategoryService categories;
    public CategoryController(CategoryService categories) { this.categories = categories; }

    @GetMapping("/api/v1/public/job-categories")
    public List<CategoryEntry> published() { return categories.list(false); }

    @GetMapping("/api/v1/dashboard/catalog")
    public List<CategoryEntry> adminList(@AuthenticationPrincipal Jwt jwt) {
        requireAdmin(jwt); return categories.list(true);
    }
    private UUID requireAdmin(Jwt jwt) {
        List<String> roles = jwt == null ? null : jwt.getClaimAsStringList("roles");
        if (roles == null || !roles.contains("SYSTEM_ADMIN")) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        return UUID.fromString(jwt.getSubject());
    }
}
