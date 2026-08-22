package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.api.dto.ApplicationResponse;
import com.smartrecruitment.core.application.api.dto.ApplyRequest;
import com.smartrecruitment.core.application.application.ApplicationService;
import jakarta.validation.Valid;
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
    public ApplicationResponse apply(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ApplyRequest request) {
        return ApplicationResponse.from(applications.apply(userId(jwt), request.jobId(), request.cvId()));
    }

    @GetMapping
    public List<ApplicationResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return applications.findMine(userId(jwt)).stream().map(ApplicationResponse::from).toList();
    }

    private UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
