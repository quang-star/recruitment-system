package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.api.dto.ApplicationStatusChangeResponse;
import com.smartrecruitment.core.application.application.ApplicationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class ApplicationHistoryController {
    private final ApplicationService applications;

    public ApplicationHistoryController(ApplicationService applications) {
        this.applications = applications;
    }

    @GetMapping("/api/v1/applications/{applicationId}/history")
    public List<ApplicationStatusChangeResponse> history(@AuthenticationPrincipal Jwt jwt,
                                                         @PathVariable UUID applicationId) {
        UUID viewerId = UUID.fromString(jwt.getSubject());
        return applications.history(viewerId, applicationId).stream()
                .map(ApplicationStatusChangeResponse::from).toList();
    }
}
