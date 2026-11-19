package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.shared.api.SubjectId;
import com.smartrecruitment.auth.user.application.AuthAdminUserLookupService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

/** System administrator read-only user lookup for audit actor resolution. */
@RestController
@RequestMapping("/api/v2/auth/admin")
public class AuthAdminController {
    private static final int MAX_IDS = 50;
    private final AuthAdminUserLookupService userLookupService;

    public AuthAdminController(AuthAdminUserLookupService userLookupService) {
        this.userLookupService = userLookupService;
    }

    @GetMapping("/users")
    public List<AuthAdminUserLookupService.UserSummary> findUsers(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(name = "ids", required = false) List<String> rawIds) {
        requireAdmin(jwt);
        if (rawIds == null || rawIds.isEmpty()) return List.of();
        List<Long> ids = new ArrayList<>();
        for (String entry : rawIds) {
            if (entry == null || entry.isBlank()) continue;
            for (String token : entry.split(",")) {
                String trimmed = token.trim();
                if (trimmed.isEmpty()) continue;
                try {
                    ids.add(SubjectId.parse(trimmed));
                } catch (RuntimeException exception) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid user id");
                }
                if (ids.size() > MAX_IDS) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At most 50 user ids may be requested");
                }
            }
        }
        return userLookupService.findByIds(ids);
    }

    private static void requireAdmin(Jwt jwt) {
        List<String> roles = jwt == null ? null : jwt.getClaimAsStringList("roles");
        if (roles == null || !roles.contains("SYSTEM_ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "System administrator access required");
        }
    }
}
