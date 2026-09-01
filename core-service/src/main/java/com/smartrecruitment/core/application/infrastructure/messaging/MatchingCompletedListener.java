package com.smartrecruitment.core.application.infrastructure.messaging;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;
import com.smartrecruitment.core.notification.application.NotificationService;

@Component
public class MatchingCompletedListener {
    private final JooqApplicationMatchingProjectionRepository projections;
    private final ObjectMapper objectMapper;
    private final NotificationService notifications;

    public MatchingCompletedListener(JooqApplicationMatchingProjectionRepository projections, ObjectMapper objectMapper,
                                     NotificationService notifications) {
        this.projections = projections;
        this.objectMapper = objectMapper;
        this.notifications = notifications;
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
            String algorithmVersion = requiredText(payload, "algorithmVersion");
            String taxonomyVersion = requiredText(payload, "taxonomyVersion");
            double score = payload.path("finalScore").asDouble();
            String flags = objectMapper.writeValueAsString(payload.path("qualityFlags"));
            String explanation = objectMapper.writeValueAsString(objectMapper.createObjectNode()
                    .set("components", payload.path("components"))
                    .set("claims", payload.path("claims")));
            if (projections.update(applicationId, cvVersionId, jobVersionId, matchingResultId, status, score, flags,
                    explanation, algorithmVersion, taxonomyVersion)) {
                notifications.matchingCompleted(applicationId, matchingResultId, score);
            }
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid matching event", exception);
        }
    }

    private static String requiredText(JsonNode payload, String field) {
        String value = payload.path(field).asText();
        if (value.isBlank()) throw new IllegalArgumentException(field + " is required");
        return value;
    }
}
