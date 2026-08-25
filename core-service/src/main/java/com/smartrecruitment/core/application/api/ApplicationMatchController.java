package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.UUID;

@RestController
public class ApplicationMatchController {
    private final JooqApplicationMatchingProjectionRepository projections;

    public ApplicationMatchController(JooqApplicationMatchingProjectionRepository projections) {
        this.projections = projections;
    }

    @GetMapping("/api/v1/applications/{applicationId}/match")
    public MatchResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId) {
        var projection = projections.findForViewer(applicationId, UUID.fromString(jwt.getSubject()))
                .orElseThrow(() -> new IllegalArgumentException("Matching result was not found"));
        return new MatchResponse(projection.applicationId(), projection.cvVersionId(), projection.jobVersionId(),
                projection.matchingResultId(), projection.status(), projection.finalScore(),
                projection.qualityFlagsJson(), projection.explanationJson(), projection.updatedAt());
    }

    public record MatchResponse(UUID applicationId, UUID cvVersionId, UUID jobVersionId,
                                UUID matchingResultId, String status, double finalScore,
                                String qualityFlags, String explanation, OffsetDateTime updatedAt) { }
}
