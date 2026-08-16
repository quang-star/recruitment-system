package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface SessionRepository {
    Session insert(Long userId, String clientType, String deviceName, String userAgent, String createdIp,
                   Instant authenticatedAt, Instant idleExpiresAt, Instant absoluteExpiresAt);
    Optional<Session> findById(Long id);
    boolean touch(Long id, String lastSeenIp, Instant lastSeenAt, Instant idleExpiresAt);
    boolean revoke(Long id, String reason, Instant revokedAt);
    record Session(Long id, UUID publicId, Long userId, Instant idleExpiresAt,
                   Instant absoluteExpiresAt, Instant revokedAt) {}
}
