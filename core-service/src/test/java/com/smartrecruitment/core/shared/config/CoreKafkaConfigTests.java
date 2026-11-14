package com.smartrecruitment.core.shared.config;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.kafka.listener.ListenerExecutionFailedException;
import org.springframework.kafka.support.SendResult;
import org.springframework.util.backoff.BackOffExecution;

import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CoreKafkaConfigTests {
    @Test
    void backOffRetriesThreeTimesWithGrowingCappedIntervals() {
        BackOffExecution execution = CoreKafkaConfig.backOff(3, 1000, 3000).start();
        assertThat(execution.nextBackOff()).isEqualTo(1000);
        assertThat(execution.nextBackOff()).isEqualTo(2000);
        assertThat(execution.nextBackOff()).isEqualTo(3000);
        assertThat(execution.nextBackOff()).isEqualTo(BackOffExecution.STOP);
    }

    @Test
    void rejectsInvalidRetryConfiguration() {
        assertThatThrownBy(() -> CoreKafkaConfig.backOff(-1, 1000, 1000)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CoreKafkaConfig.backOff(3, 2000, 1000)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void exhaustedRecordIsPublishedToDeadLetterTopicWithoutFixedPartition() {
        KafkaOperations<Object, Object> kafka = mock(KafkaOperations.class);
        when(kafka.isTransactional()).thenReturn(false);
        when(kafka.send(any(ProducerRecord.class)))
                .thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));
        var handler = new CoreKafkaConfig().kafkaErrorHandler(kafka, "core.consumer.dlq.v2", 0, 1, 1);
        var record = new ConsumerRecord<Object, Object>("matching.completed.v2", 2, 41L, "7", "{}");

        boolean handled = handler.handleOne(new ListenerExecutionFailedException("boom", new IllegalArgumentException("bad")),
                record, mock(org.apache.kafka.clients.consumer.Consumer.class),
                mock(org.springframework.kafka.listener.MessageListenerContainer.class));

        assertThat(handled).isTrue();
        var sent = org.mockito.ArgumentCaptor.forClass(ProducerRecord.class);
        verify(kafka).send(sent.capture());
        assertThat(sent.getValue().topic()).isEqualTo("core.consumer.dlq.v2");
        assertThat(sent.getValue().partition()).isNull();
        assertThat(sent.getValue().value()).isEqualTo("{}");
    }
}
