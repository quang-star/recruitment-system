package com.smartrecruitment.core.job.infrastructure.messaging;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.job.infrastructure.persistence.JooqJobProcessingProjectionRepository;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;


@Component
public class JobConfirmedListener {
    private final JooqJobProcessingProjectionRepository projections;
    private final ObjectMapper objectMapper;

    public JobConfirmedListener(JooqJobProcessingProjectionRepository projections, ObjectMapper objectMapper) {
        this.projections = projections;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${core.kafka.job-confirmed-topic:job.confirmed.v2}",
            groupId = "core-job-confirmed-v2")
    public void onMessage(String rawMessage) {
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            if (!"job.confirmed.v2".equals(root.path("eventType").asText())) {
                throw new IllegalArgumentException("Unexpected job confirmation event type");
            }
            JsonNode payload = root.path("payload");
            Long jobId = com.smartrecruitment.core.shared.domain.BusinessIds.parse(payload.path("jobId").asText());
            Long jobVersionId = com.smartrecruitment.core.shared.domain.BusinessIds.parse(payload.path("jobVersionId").asText());
            com.smartrecruitment.core.shared.domain.BusinessIds.parse(payload.path("parsedRevisionId").asText());
            // Confirmation refers to the persisted revision, not a synthetic task identity.
            projections.update(jobId, jobVersionId, null, payload.path("sourceHash").asText(), "CONFIRMED", null);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid job confirmation event", exception);
        }
    }
}
