package com.smartrecruitment.core.shared.infrastructure.messaging;

import java.time.Duration;

/**
 * Exponential publish backoff for the transactional outbox. Events are never dropped:
 * privacy commands (cv.deleted, cv-access.revoked) must eventually reach the AI service,
 * so after {@code alertAfterAttempts} the relay only escalates logging.
 */
public record OutboxRetryPolicy(Duration initialDelay, Duration maxDelay, int alertAfterAttempts) {
    public OutboxRetryPolicy {
        if (initialDelay == null || maxDelay == null || initialDelay.isNegative() || initialDelay.isZero()
                || maxDelay.compareTo(initialDelay) < 0 || alertAfterAttempts < 1) {
            throw new IllegalArgumentException("Invalid outbox retry policy");
        }
    }

    /** Delay before the next attempt, given the number of attempts already made (1-based). */
    public Duration delayAfter(int attempts) {
        int exponent = Math.max(0, Math.min(attempts - 1, 30));
        long millis = initialDelay.toMillis();
        long capped = maxDelay.toMillis();
        for (int i = 0; i < exponent && millis < capped; i++) millis *= 2;
        return Duration.ofMillis(Math.min(millis, capped));
    }

    public boolean shouldAlert(int attempts) {
        return attempts >= alertAfterAttempts;
    }
}
