package com.smartrecruitment.core.dashboard.api;

import com.smartrecruitment.core.dashboard.application.DashboardService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {
    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) { this.dashboard = dashboard; }

    @GetMapping
    public DashboardResponse get(@AuthenticationPrincipal Jwt jwt,
                                 @RequestParam(required = false) UUID companyId) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        var result = dashboard.get(UUID.fromString(jwt.getSubject()), roles == null ? List.of() : roles, companyId);
        return new DashboardResponse(result.audience(), result.metrics());
    }

    public record DashboardResponse(String audience, Map<String, Long> metrics) { }
}

