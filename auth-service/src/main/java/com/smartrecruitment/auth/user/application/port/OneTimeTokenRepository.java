package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.Optional;

public interface OneTimeTokenRepository {

    void insertEmailVerificationToken(Long userId, String tokenHash, Instant createdAt, Instant expiresAt);

    Optional<OneTimeToken> findActiveEmailVerificationToken(String tokenHash, Instant now);

    default void insertPasswordResetToken(Long userId, String tokenHash, Instant createdAt, Instant expiresAt) {
        throw new UnsupportedOperationException("Password reset tokens are not supported");
    }

    default Optional<OneTimeToken> findActivePasswordResetToken(String tokenHash, Instant now) {
        return Optional.empty();
    }

    default boolean invalidateActiveTokens(Long userId, String tokenType, Instant invalidatedAt) {
        return false;
    }

    default boolean hasRecentlyIssuedActiveToken(Long userId, String tokenType, Instant createdAfter, Instant now) {
        return false;
    }

    boolean consume(Long id, Instant consumedAt);

    record OneTimeToken(Long id, Long userId, Instant expiresAt) {
    }
}
