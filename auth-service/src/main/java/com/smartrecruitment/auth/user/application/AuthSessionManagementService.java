package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.SessionRepository;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class AuthSessionManagementService {
    private final AuthUserRepository users;
    private final SessionRepository sessions;
    private final Clock clock;

    public AuthSessionManagementService(AuthUserRepository users, SessionRepository sessions, Clock clock) {
        this.users = users;
        this.sessions = sessions;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<SessionResult> list(UUID publicUserId) {
        var user = users.findByPublicId(publicUserId)
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(CurrentUserUnavailableException::new);
        Instant now = Instant.now(clock);
        return sessions.findAllByUserId(user.id()).stream()
                .map(value -> SessionResult.from(value, now))
                .toList();
    }

    @Transactional
    public void revoke(UUID publicUserId, UUID sessionId) {
        var user = users.findByPublicId(publicUserId)
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(CurrentUserUnavailableException::new);
        if (!sessions.revokeByPublicIdAndUserId(sessionId, user.id(), "USER_REVOKED", Instant.now(clock))) {
            throw new SessionNotFoundException();
        }
    }

    public record SessionResult(UUID sessionId, String clientType, String deviceName, String userAgent,
                                String createdIp, String lastSeenIp, Instant authenticatedAt, Instant lastSeenAt,
                                Instant idleExpiresAt, Instant absoluteExpiresAt, Instant revokedAt,
                                String revokeReason, boolean active) {
        static SessionResult from(SessionRepository.SessionDetails value, Instant now) {
            return new SessionResult(value.publicId(), value.clientType(), value.deviceName(), value.userAgent(),
                    value.createdIp(), value.lastSeenIp(), value.authenticatedAt(), value.lastSeenAt(),
                    value.idleExpiresAt(), value.absoluteExpiresAt(), value.revokedAt(), value.revokeReason(),
                    value.activeAt(now));
        }
    }
}
