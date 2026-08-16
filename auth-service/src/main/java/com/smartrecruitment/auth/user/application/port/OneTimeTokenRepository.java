package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.Optional;

public interface OneTimeTokenRepository {

    void insertEmailVerificationToken(Long userId, String tokenHash, Instant createdAt, Instant expiresAt);

    Optional<OneTimeToken> findActiveEmailVerificationToken(String tokenHash, Instant now);

    boolean consume(Long id, Instant consumedAt);

    record OneTimeToken(Long id, Long userId, Instant expiresAt) {
    }
}
