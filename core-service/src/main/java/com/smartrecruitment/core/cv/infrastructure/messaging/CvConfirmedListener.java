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
public class CvConfirmedListener {
    private static final Logger log = LoggerFactory.getLogger(CvConfirmedListener.class);
    private final CandidateCvRepository cvs;
    private final ObjectMapper objectMapper;

    public CvConfirmedListener(CandidateCvRepository cvs, ObjectMapper objectMapper) {
        this.cvs = cvs;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${core.kafka.cv-confirmed-topic:cv.confirmed.v1}",
            groupId = "core-cv-confirmed-v1")
    public void onMessage(String rawMessage) {
        try {
            JsonNode root = objectMapper.readTree(rawMessage);
            if (!"cv.confirmed.v1".equals(root.path("eventType").asText())) {
                throw new IllegalArgumentException("Unexpected CV confirmation event type");
            }
            JsonNode payload = root.path("payload");
            UUID versionId = UUID.fromString(payload.path("cvVersionId").asText());
            UUID.fromString(payload.path("parsedRevisionId").asText());
            String sourceHash = payload.path("sourceHash").asText();
            if (!cvs.updateProcessingStatus(versionId, sourceHash, CvProcessingStatus.CONFIRMED, null)) {
                log.warn("Ignoring CV confirmation for unknown or changed version {}", versionId);
            }
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid CV confirmation event", exception);
        }
    }
}
