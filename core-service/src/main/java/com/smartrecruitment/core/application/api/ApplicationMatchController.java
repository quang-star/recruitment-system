package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
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
    private final ObjectMapper objectMapper;

    public ApplicationMatchController(JooqApplicationMatchingProjectionRepository projections,
                                      ObjectMapper objectMapper) {
        this.projections = projections;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/api/v1/applications/{applicationId}/match")
    public MatchResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId) {
        var projection = projections.findForViewer(applicationId, UUID.fromString(jwt.getSubject()))
                .orElseThrow(() -> new IllegalArgumentException("Matching result was not found"));
        return new MatchResponse(projection.applicationId(), projection.cvVersionId(), projection.jobVersionId(),
                projection.matchingResultId(), projection.status(), projection.finalScore(),
                readJson(projection.qualityFlagsJson()), readJson(projection.explanationJson()),
                projection.algorithmVersion(), projection.taxonomyVersion(),
                projection.updatedAt());
    }

    private JsonNode readJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Stored matching projection contains invalid JSON", exception);
        }
    }

    public record MatchResponse(UUID applicationId, UUID cvVersionId, UUID jobVersionId,
                                UUID matchingResultId, String status, double finalScore,
                                JsonNode qualityFlags, JsonNode explanation,
                                String algorithmVersion, String taxonomyVersion, OffsetDateTime updatedAt) { }
}
