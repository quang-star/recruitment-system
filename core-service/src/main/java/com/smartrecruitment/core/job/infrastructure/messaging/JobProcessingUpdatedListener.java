package com.smartrecruitment.core.job.infrastructure.messaging;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.job.infrastructure.persistence.JooqJobProcessingProjectionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class JobProcessingUpdatedListener {
    private static final Logger log = LoggerFactory.getLogger(JobProcessingUpdatedListener.class);
    private final JooqJobProcessingProjectionRepository projections;
    private final ObjectMapper objectMapper;

    public JobProcessingUpdatedListener(JooqJobProcessingProjectionRepository projections, ObjectMapper objectMapper) {
        this.projections = projections;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${core.kafka.job-processing-updated-topic:job.processing.updated.v1}",
            groupId = "core-job-processing-v1")
    public void onMessage(String rawMessage) {
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            if (!"job.processing.updated.v1".equals(root.path("eventType").asText())) {
                throw new IllegalArgumentException("Unexpected job processing event type");
            }
            JsonNode payload = root.path("payload");
            UUID jobId = UUID.fromString(payload.path("jobId").asText());
            UUID jobVersionId = UUID.fromString(payload.path("jobVersionId").asText());
            UUID taskId = UUID.fromString(payload.path("processingTaskId").asText());
            String sourceHash = payload.path("sourceHash").asText();
            String status = payload.path("status").asText();
            String failureCode = payload.path("failureCode").isNull()
                    ? null : payload.path("failureCode").asText(null);
            if (!("PARSED".equals(status) || "FAILED".equals(status))) {
                throw new IllegalArgumentException("Unsupported job processing status");
            }
            projections.update(jobId, jobVersionId, taskId, sourceHash, status, failureCode);
        } catch (Exception exception) {
            log.warn("Invalid job processing event error_type={}", exception.getClass().getSimpleName());
            throw new IllegalArgumentException("Invalid job processing event", exception);
        }
    }
}
