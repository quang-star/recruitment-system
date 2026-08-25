package com.smartrecruitment.core.job.infrastructure.messaging;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.job.infrastructure.persistence.JooqJobProcessingProjectionRepository;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Component
public class JobConfirmedListener {
    private final JooqJobProcessingProjectionRepository projections;
    private final ObjectMapper objectMapper;

    public JobConfirmedListener(JooqJobProcessingProjectionRepository projections, ObjectMapper objectMapper) {
        this.projections = projections;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${core.kafka.job-confirmed-topic:job.confirmed.v1}",
            groupId = "core-job-confirmed-v1")
    public void onMessage(String rawMessage) {
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            if (!"job.confirmed.v1".equals(root.path("eventType").asText())) {
                throw new IllegalArgumentException("Unexpected job confirmation event type");
            }
            JsonNode payload = root.path("payload");
            UUID jobId = UUID.fromString(payload.path("jobId").asText());
            UUID jobVersionId = UUID.fromString(payload.path("jobVersionId").asText());
            UUID revisionId = UUID.fromString(payload.path("parsedRevisionId").asText());
            UUID taskId = UUID.nameUUIDFromBytes((jobVersionId + ":" + revisionId).getBytes(StandardCharsets.UTF_8));
            projections.update(jobId, jobVersionId, taskId, payload.path("sourceHash").asText(), "CONFIRMED", null);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid job confirmation event", exception);
        }
    }
}
