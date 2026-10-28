package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.api.dto.ApplicationResponse;
import com.smartrecruitment.core.application.api.dto.ApplyRequest;
import com.smartrecruitment.core.application.api.dto.WithdrawApplicationRequest;
import com.smartrecruitment.core.application.application.ApplicationSearch;
import com.smartrecruitment.core.application.application.ApplicationService;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import com.smartrecruitment.core.shared.application.PageResult;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v2/candidate/applications")
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

    @GetMapping(params = "!page")
    public List<ApplicationResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return applications.findMine(userId(jwt)).stream().map(ApplicationResponse::from).toList();
    }

    @GetMapping(params = "page")
    public PageResult<ApplicationResponse> search(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam int page, @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(required = false) ApplicationStatus status) {
        var search = new ApplicationSearch(page, size, q, sort, status);
        return applications.searchMine(userId(jwt), search).map(ApplicationResponse::from);
    }

    @GetMapping("/{applicationId}")
    public ApplicationResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long applicationId) {
        return ApplicationResponse.from(applications.getMine(userId(jwt), applicationId));
    }

    @PostMapping("/{applicationId}/withdraw")
    public ApplicationResponse withdraw(@AuthenticationPrincipal Jwt jwt, @PathVariable Long applicationId,
                                        @Valid @RequestBody WithdrawApplicationRequest request) {
        return ApplicationResponse.from(applications.withdraw(userId(jwt), applicationId,
                request.reason(), request.version()));
    }

    private Long userId(Jwt jwt) { return com.smartrecruitment.core.shared.api.SubjectId.parse(jwt.getSubject()); }
    @DeleteMapping("/{applicationId}/cv-access")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void revokeCvAccess(@AuthenticationPrincipal Jwt jwt, @PathVariable Long applicationId, @RequestParam long version) {
        applications.revokeCvAccess(userId(jwt), applicationId, version);
    }
}
