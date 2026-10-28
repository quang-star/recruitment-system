package com.smartrecruitment.core.application.infrastructure.messaging;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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

    @KafkaListener(topics = "${core.kafka.matching-completed-topic:matching.completed.v2}",
            groupId = "core-matching-completed-v2")
    @Transactional
    public void onMessage(String rawMessage) {
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            if (!"matching.completed.v2".equals(root.path("eventType").asText())) {
                throw new IllegalArgumentException("Unexpected matching event type");
            }
            JsonNode payload = root.path("payload");
            Long applicationId = com.smartrecruitment.core.shared.domain.BusinessIds.parse(payload.path("applicationId").asText());
            Long cvVersionId = com.smartrecruitment.core.shared.domain.BusinessIds.parse(payload.path("cvVersionId").asText());
            Long jobVersionId = com.smartrecruitment.core.shared.domain.BusinessIds.parse(payload.path("jobVersionId").asText());
            Long matchingResultId = com.smartrecruitment.core.shared.domain.BusinessIds.parse(payload.path("matchingResultId").asText());
            Long resultGeneration = optionalGeneration(payload);
            Long supersedesMatchingResultId = optionalId(payload, "supersedesMatchingResultId");
            if (matchingResultId.equals(supersedesMatchingResultId)) throw new IllegalArgumentException("Matching result cannot supersede itself");
            String status = payload.path("status").asText();
            String algorithmVersion = requiredText(payload, "algorithmVersion");
            String taxonomyVersion = requiredText(payload, "taxonomyVersion");
            double score = payload.path("finalScore").asDouble();
            String flags = objectMapper.writeValueAsString(payload.path("qualityFlags"));
            var explanationNode = objectMapper.createObjectNode();
            explanationNode.set("components", payload.path("components"));
            explanationNode.set("claims", payload.path("claims"));
            explanationNode.set("inputRevisions", payload.path("inputRevisions"));
            String explanation = objectMapper.writeValueAsString(explanationNode);
            if (projections.update(applicationId, cvVersionId, jobVersionId, matchingResultId, status, score, flags,
                    explanation, algorithmVersion, taxonomyVersion, resultGeneration, supersedesMatchingResultId)) {
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

    private static Long optionalGeneration(JsonNode payload) {
        JsonNode value = payload.get("resultGeneration");
        if (value == null || value.isNull()) return null;
        if (!value.isIntegralNumber() || !value.canConvertToLong() || value.asLong() < 1) {
            throw new IllegalArgumentException("Invalid matching result generation");
        }
        return value.asLong();
    }

    private static Long optionalId(JsonNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || value.isNull()) return null;
        if (!value.isString()) throw new IllegalArgumentException("Invalid " + field);
        return com.smartrecruitment.core.shared.domain.BusinessIds.parse(value.asText());
    }
}
