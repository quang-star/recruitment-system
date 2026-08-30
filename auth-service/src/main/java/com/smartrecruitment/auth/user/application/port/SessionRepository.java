package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface SessionRepository {
    Session insert(Long userId, String clientType, String deviceName, String userAgent, String createdIp,
                   Instant authenticatedAt, Instant idleExpiresAt, Instant absoluteExpiresAt);
    Optional<Session> findById(Long id);
    boolean touch(Long id, String lastSeenIp, Instant lastSeenAt, Instant idleExpiresAt);
    boolean revoke(Long id, String reason, Instant revokedAt);
    default int revokeAllByUserId(Long userId, String reason, Instant revokedAt) { return 0; }
    default boolean revokeByPublicIdAndUserId(UUID publicId, Long userId, String reason, Instant revokedAt) {
        return false;
    }
    default List<SessionDetails> findAllByUserId(Long userId) { return List.of(); }
    record Session(Long id, UUID publicId, Long userId, Instant idleExpiresAt,
                   Instant absoluteExpiresAt, Instant revokedAt) {}
    record SessionDetails(UUID publicId, String clientType, String deviceName, String userAgent,
                          String createdIp, String lastSeenIp, Instant authenticatedAt, Instant lastSeenAt,
                          Instant idleExpiresAt, Instant absoluteExpiresAt, Instant revokedAt, String revokeReason) {
        public boolean activeAt(Instant now) {
            return revokedAt == null && idleExpiresAt.isAfter(now) && absoluteExpiresAt.isAfter(now);
        }
    }
}
