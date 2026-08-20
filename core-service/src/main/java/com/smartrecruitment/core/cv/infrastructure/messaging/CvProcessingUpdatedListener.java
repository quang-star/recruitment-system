package com.smartrecruitment.core.cv.infrastructure.messaging;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.cv.application.port.CandidateCvRepository;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class CvProcessingUpdatedListener {
    private static final Logger log = LoggerFactory.getLogger(CvProcessingUpdatedListener.class);
    private final CandidateCvRepository cvs;
    private final ObjectMapper objectMapper;

    public CvProcessingUpdatedListener(CandidateCvRepository cvs, ObjectMapper objectMapper) {
        this.cvs = cvs;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${core.kafka.cv-processing-updated-topic:cv.processing.updated.v1}",
            groupId = "core-cv-processing-v1")
    public void onMessage(String rawMessage) {
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            if (!"cv.processing.updated.v1".equals(root.path("eventType").asText())) {
                throw new IllegalArgumentException("Unexpected CV processing event type");
            }
            JsonNode payload = root.path("payload");
            UUID versionId = UUID.fromString(payload.path("cvVersionId").asText());
            String sourceHash = payload.path("sourceHash").asText();
            CvProcessingStatus status = CvProcessingStatus.valueOf(payload.path("status").asText());
            String failureCode = payload.path("failureCode").isNull()
                    ? null : payload.path("failureCode").asText(null);
            if (!cvs.updateProcessingStatus(versionId, sourceHash, status, failureCode)) {
                log.warn("Ignoring CV processing event for unknown or changed version {}", versionId);
            }
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid CV processing event", exception);
        }
    }
}
