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

@RestController
@RequestMapping("/api/v2/dashboard")
public class DashboardController {
    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) { this.dashboard = dashboard; }

    @GetMapping
    public DashboardResponse get(@AuthenticationPrincipal Jwt jwt,
                                 @RequestParam(required = false) Long companyId) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        var result = dashboard.get(com.smartrecruitment.core.shared.api.SubjectId.parse(jwt.getSubject()), roles == null ? List.of() : roles, companyId);
        return new DashboardResponse(
                result.audience(),
                result.metrics(),
                result.pendingJobId(),
                result.pendingJobTitle()
        );
    }

    public record DashboardResponse(
            String audience,
            Map<String, Long> metrics,
            Long pendingJobId,
            String pendingJobTitle
    ) { }
}

