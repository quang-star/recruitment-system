package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.api.dto.ApplicationResponse;
import com.smartrecruitment.core.application.api.dto.UpdateApplicationStatusRequest;
import com.smartrecruitment.core.application.application.ApplicationService;
import jakarta.validation.Valid;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/recruiter/applications")
public class RecruiterApplicationController {
    private final ApplicationService applications;

    public RecruiterApplicationController(ApplicationService applications) { this.applications = applications; }

    @GetMapping
    public List<ApplicationResponse> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID jobId) {
        return applications.findForRecruiter(userId(jwt), jobId).stream().map(ApplicationResponse::from).toList();
    }

    @PatchMapping("/{applicationId}/status")
    public ApplicationResponse updateStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId,
                                            @Valid @RequestBody UpdateApplicationStatusRequest request) {
        return ApplicationResponse.from(applications.updateStatus(userId(jwt), applicationId, request.status(),
                request.reason(), request.version()));
    }

    private UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
