package com.smartrecruitment.core.cv.infrastructure.messaging;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqOutboxEventRepository;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Component
public class KafkaOutboxRelay {
    private static final Logger log = LoggerFactory.getLogger(KafkaOutboxRelay.class);
    private final JooqOutboxEventRepository outbox;
    private final KafkaTemplate<String, String> kafka;
    private final ObjectMapper objectMapper;
    private final String workerId = "core-outbox-" + UUID.randomUUID();
    private final int batchSize;

    public KafkaOutboxRelay(JooqOutboxEventRepository outbox, KafkaTemplate<String, String> kafka,
                            ObjectMapper objectMapper,
                            @Value("${core.outbox.batch-size:20}") int batchSize) {
        this.outbox = outbox;
        this.kafka = kafka;
        this.objectMapper = objectMapper;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${core.outbox.poll-delay-ms:1000}")
    public void publishPending() {
        for (var event : outbox.claimPending(workerId, batchSize)) {
            try {
                kafka.send(new ProducerRecord<>(event.eventType(), event.aggregateId().toString(), envelope(event)))
                        .get(10, TimeUnit.SECONDS);
                outbox.markPublished(event.id(), workerId);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                outbox.markFailed(event.id(), workerId, "PUBLISH_INTERRUPTED");
                return;
            } catch (ExecutionException | TimeoutException | JacksonException exception) {
                log.warn("Could not publish outbox event {} with code KAFKA_PUBLISH_FAILED", event.eventId());
                outbox.markFailed(event.id(), workerId, "KAFKA_PUBLISH_FAILED");
            }
        }
    }

    private String envelope(JooqOutboxEventRepository.PendingOutboxEvent event)
            throws JacksonException {
        var envelope = new EventEnvelope(event.eventId(), event.eventType(), event.schemaVersion(),
                event.correlationId(), event.idempotencyKey(), event.occurredAt(),
                objectMapper.readTree(event.payload()));
        return objectMapper.writeValueAsString(envelope);
    }

    private record EventEnvelope(UUID eventId, String eventType, short schemaVersion, UUID correlationId,
                                 String idempotencyKey, OffsetDateTime occurredAt, Object payload) {
    }
}
