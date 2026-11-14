package com.smartrecruitment.core.shared.infrastructure.messaging;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OutboxRetryPolicyTests {
    private final OutboxRetryPolicy policy = new OutboxRetryPolicy(Duration.ofSeconds(5), Duration.ofMinutes(5), 10);

    @Test
    void delayDoublesFromInitialDelayAndIsCapped() {
        assertThat(policy.delayAfter(1)).isEqualTo(Duration.ofSeconds(5));
        assertThat(policy.delayAfter(2)).isEqualTo(Duration.ofSeconds(10));
        assertThat(policy.delayAfter(4)).isEqualTo(Duration.ofSeconds(40));
        assertThat(policy.delayAfter(7)).isEqualTo(Duration.ofMinutes(5));
        assertThat(policy.delayAfter(Integer.MAX_VALUE)).isEqualTo(Duration.ofMinutes(5));
        assertThat(policy.delayAfter(0)).isEqualTo(Duration.ofSeconds(5));
    }

    @Test
    void alertsOnlyAfterThreshold() {
        assertThat(policy.shouldAlert(9)).isFalse();
        assertThat(policy.shouldAlert(10)).isTrue();
    }

    @Test
    void rejectsInvalidConfiguration() {
        assertThatThrownBy(() -> new OutboxRetryPolicy(Duration.ZERO, Duration.ofSeconds(1), 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OutboxRetryPolicy(Duration.ofSeconds(10), Duration.ofSeconds(1), 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OutboxRetryPolicy(Duration.ofSeconds(1), Duration.ofSeconds(1), 0))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
