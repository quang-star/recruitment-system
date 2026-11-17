package com.smartrecruitment.core.shared.infrastructure.messaging;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.smartrecruitment.core.shared.infrastructure.persistence.JooqOutboxEventRepository;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
    private final OutboxRetryPolicy retryPolicy;
    private final Duration retention;

    public KafkaOutboxRelay(JooqOutboxEventRepository outbox, KafkaTemplate<String, String> kafka,
                            ObjectMapper objectMapper,
                            @Value("${core.outbox.batch-size:20}") int batchSize,
                            @Value("${core.outbox.retry.initial-delay-ms:5000}") long initialDelayMs,
                            @Value("${core.outbox.retry.max-delay-ms:300000}") long maxDelayMs,
                            @Value("${core.outbox.retry.alert-after-attempts:10}") int alertAfterAttempts,
                            @Value("${core.outbox.retention-days:14}") int retentionDays) {
        if (retentionDays < 1) throw new IllegalArgumentException("Outbox retention must be at least one day");
        this.outbox = outbox;
        this.kafka = kafka;
        this.objectMapper = objectMapper;
        this.batchSize = batchSize;
        this.retryPolicy = new OutboxRetryPolicy(Duration.ofMillis(initialDelayMs), Duration.ofMillis(maxDelayMs),
                alertAfterAttempts);
        this.retention = Duration.ofDays(retentionDays);
    }

    @Scheduled(fixedDelayString = "${core.outbox.poll-delay-ms:1000}")
    public void publishPending() {
        for (var event : outbox.claimPending(workerId, batchSize)) {
            try {
                String topic = switch (event.eventType()) {
                    case "cv.deleted.v2" -> "cv.uploaded.v2";
                    case "application.cv-access.revoked.v2" -> "application.submitted.v2";
                    default -> event.eventType();
                };
                kafka.send(new ProducerRecord<>(topic, event.aggregateId().toString(), envelope(event)))
                        .get(10, TimeUnit.SECONDS);
                outbox.markPublished(event.id(), workerId);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                outbox.markFailed(event.id(), workerId, "PUBLISH_INTERRUPTED", retryPolicy.delayAfter(event.attemptCount()));
                return;
            } catch (ExecutionException | TimeoutException | JacksonException exception) {
                fail(event, "KAFKA_PUBLISH_FAILED");
            }
        }
    }

    @Scheduled(fixedDelayString = "${core.outbox.cleanup-delay-ms:3600000}",
            initialDelayString = "${core.outbox.cleanup-initial-delay-ms:60000}")
    public void deletePublished() {
        var cutoff = OffsetDateTime.now(ZoneOffset.UTC).minus(retention);
        int deleted;
        int total = 0;
        do {
            deleted = outbox.deletePublishedBefore(cutoff, 500);
            total += deleted;
        } while (deleted == 500);
        if (total > 0) log.info("Deleted {} published outbox events older than {}", total, cutoff);
    }

    private void fail(JooqOutboxEventRepository.PendingOutboxEvent event, String errorCode) {
        var delay = retryPolicy.delayAfter(event.attemptCount());
        if (retryPolicy.shouldAlert(event.attemptCount())) {
            log.error("Outbox event {} ({}) still unpublished after {} attempts; next attempt in {}s",
                    event.eventId(), event.eventType(), event.attemptCount(), delay.toSeconds());
        } else {
            log.warn("Could not publish outbox event {} with code {}", event.eventId(), errorCode);
        }
        outbox.markFailed(event.id(), workerId, errorCode, delay);
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
