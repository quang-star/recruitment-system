package com.smartrecruitment.core.application.infrastructure.messaging;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class MatchingCompletedListener {
    private final JooqApplicationMatchingProjectionRepository projections;
    private final ObjectMapper objectMapper;

    public MatchingCompletedListener(JooqApplicationMatchingProjectionRepository projections, ObjectMapper objectMapper) {
        this.projections = projections;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${core.kafka.matching-completed-topic:matching.completed.v1}",
            groupId = "core-matching-completed-v1")
    public void onMessage(String rawMessage) {
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            if (!"matching.completed.v1".equals(root.path("eventType").asText())) {
                throw new IllegalArgumentException("Unexpected matching event type");
            }
            JsonNode payload = root.path("payload");
            UUID applicationId = UUID.fromString(payload.path("applicationId").asText());
            UUID cvVersionId = UUID.fromString(payload.path("cvVersionId").asText());
            UUID jobVersionId = UUID.fromString(payload.path("jobVersionId").asText());
            UUID matchingResultId = UUID.fromString(payload.path("matchingResultId").asText());
            String status = payload.path("status").asText();
            double score = payload.path("finalScore").asDouble();
            String flags = objectMapper.writeValueAsString(payload.path("qualityFlags"));
            String explanation = objectMapper.writeValueAsString(objectMapper.createObjectNode()
                    .set("components", payload.path("components"))
                    .set("claims", payload.path("claims")));
            projections.update(applicationId, cvVersionId, jobVersionId, matchingResultId, status, score, flags, explanation);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid matching event", exception);
        }
    }
}
