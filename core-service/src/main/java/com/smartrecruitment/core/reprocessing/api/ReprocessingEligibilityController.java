package com.smartrecruitment.core.reprocessing.api;

import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck;
import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityService;
import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
public class ReprocessingEligibilityController {
    private final ReprocessingEligibilityService service;

    public ReprocessingEligibilityController(ReprocessingEligibilityService service) { this.service = service; }

    @PostMapping("/api/v2/dashboard/reprocessing/eligibility")
    public ReprocessingEligibilityService.Eligibility check(@AuthenticationPrincipal Jwt jwt,
                                                           @Valid @RequestBody EligibilityRequest request) {
        List<String> roles = jwt == null ? null : jwt.getClaimAsStringList("roles");
        if (roles == null || !roles.contains("SYSTEM_ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
        return service.check(new ReprocessingEligibilityCheck(request.operation(), request.resourceId(), request.sourceOwnerId(),
                request.sourceHash(), request.cvVersionId(), request.jobVersionId()));
    }

    public record EligibilityRequest(@NotNull Operation operation, @NotNull Long resourceId, Long sourceOwnerId,
                                     @Pattern(regexp = "[0-9a-f]{64}") String sourceHash,
                                     Long cvVersionId, Long jobVersionId) { }
}
