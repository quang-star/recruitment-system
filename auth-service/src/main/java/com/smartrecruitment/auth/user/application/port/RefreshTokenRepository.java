package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository {
    RefreshToken insert(Long sessionId, String tokenHash, Long parentTokenId, Instant issuedAt, Instant expiresAt);
    Optional<RefreshToken> findByHash(String tokenHash);
    boolean markUsedAndReplaced(Long id, Instant usedAt, Long replacementId);
    record RefreshToken(Long id, UUID publicId, Long sessionId, Long userId, String tokenHash,
                        Instant expiresAt, Instant usedAt, Instant revokedAt, Instant sessionRevokedAt) {
        public boolean activeAt(Instant now) {
            return usedAt == null && revokedAt == null && sessionRevokedAt == null && expiresAt.isAfter(now);
        }
    }
}
