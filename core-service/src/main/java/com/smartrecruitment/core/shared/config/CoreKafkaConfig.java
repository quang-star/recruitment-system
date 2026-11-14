package com.smartrecruitment.core.shared.config;

import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

/**
 * Bounded consumer retries (BR-043): a failing record is retried with exponential
 * backoff, then published to the Core dead-letter topic instead of being dropped.
 * Spring Boot applies this single CommonErrorHandler bean to every @KafkaListener.
 */
@Configuration
public class CoreKafkaConfig {
    private static final Logger log = LoggerFactory.getLogger(CoreKafkaConfig.class);

    @Bean
    DefaultErrorHandler kafkaErrorHandler(KafkaOperations<Object, Object> kafka,
                                          @Value("${core.kafka.dead-letter-topic:core.consumer.dlq.v2}") String deadLetterTopic,
                                          @Value("${core.kafka.consumer-retry.max-retries:3}") int maxRetries,
                                          @Value("${core.kafka.consumer-retry.initial-interval-ms:1000}") long initialIntervalMs,
                                          @Value("${core.kafka.consumer-retry.max-interval-ms:10000}") long maxIntervalMs) {
        var recoverer = new DeadLetterPublishingRecoverer(kafka, (record, exception) -> {
            // Original topic/partition/offset and the exception travel in kafka_dlt-* headers.
            log.error("Kafka record from {}-{}@{} sent to {} after {} retries",
                    record.topic(), record.partition(), record.offset(), deadLetterTopic, maxRetries);
            return new TopicPartition(deadLetterTopic, -1);
        });
        return new DefaultErrorHandler(recoverer, backOff(maxRetries, initialIntervalMs, maxIntervalMs));
    }

    static ExponentialBackOff backOff(int maxRetries, long initialIntervalMs, long maxIntervalMs) {
        if (maxRetries < 0 || initialIntervalMs < 1 || maxIntervalMs < initialIntervalMs) {
            throw new IllegalArgumentException("Invalid Kafka consumer retry configuration");
        }
        var backOff = new ExponentialBackOff(initialIntervalMs, 2.0);
        backOff.setMaxInterval(maxIntervalMs);
        backOff.setMaxAttempts(maxRetries);
        return backOff;
    }
}
