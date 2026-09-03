package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.api.dto.ApplicationResponse;
import com.smartrecruitment.core.application.api.dto.ApplyRequest;
import com.smartrecruitment.core.application.api.dto.WithdrawApplicationRequest;
import com.smartrecruitment.core.application.application.ApplicationService;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/candidate/applications")
public class CandidateApplicationController {
    private final ApplicationService applications;

    public CandidateApplicationController(ApplicationService applications) { this.applications = applications; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApplicationResponse apply(@AuthenticationPrincipal Jwt jwt, HttpServletRequest servletRequest,
                                     @RequestHeader("Idempotency-Key") String idempotencyKey,
                                     @Valid @RequestBody ApplyRequest request) {
        return ApplicationResponse.from(applications.apply(userId(jwt), request.jobId(), request.cvId(),
                request.cvVersionId(), request.coverLetter(), request.consentAccepted(), request.policyVersion(),
                idempotencyKey, UUID.fromString(CorrelationIdFilter.current(servletRequest))));
    }

    @GetMapping
    public List<ApplicationResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return applications.findMine(userId(jwt)).stream().map(ApplicationResponse::from).toList();
    }

    @GetMapping("/{applicationId}")
    public ApplicationResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId) {
        return ApplicationResponse.from(applications.getMine(userId(jwt), applicationId));
    }

    @PostMapping("/{applicationId}/withdraw")
    public ApplicationResponse withdraw(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId,
                                        @Valid @RequestBody WithdrawApplicationRequest request) {
        return ApplicationResponse.from(applications.withdraw(userId(jwt), applicationId,
                request.reason(), request.version()));
    }

    private UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
