package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.SessionRepository;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

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
    public List<SessionResult> list(Long userId) {
        var user = users.findById(userId)
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(CurrentUserUnavailableException::new);
        Instant now = Instant.now(clock);
        return sessions.findAllByUserId(user.id()).stream()
                .map(value -> SessionResult.from(value, now))
                .toList();
    }

    @Transactional
    public void revoke(Long userId, Long sessionId) {
        var user = users.findById(userId)
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(CurrentUserUnavailableException::new);
        if (!sessions.revokeByIdAndUserId(sessionId, user.id(), "USER_REVOKED", Instant.now(clock))) {
            throw new SessionNotFoundException();
        }
    }

    public record SessionResult(String sessionId, String clientType, String deviceName, String userAgent,
                                String createdIp, String lastSeenIp, Instant authenticatedAt, Instant lastSeenAt,
                                Instant idleExpiresAt, Instant absoluteExpiresAt, Instant revokedAt,
                                String revokeReason, boolean active) {
        static SessionResult from(SessionRepository.SessionDetails value, Instant now) {
            return new SessionResult(value.id().toString(), value.clientType(), value.deviceName(), value.userAgent(),
                    value.createdIp(), value.lastSeenIp(), value.authenticatedAt(), value.lastSeenAt(),
                    value.idleExpiresAt(), value.absoluteExpiresAt(), value.revokedAt(), value.revokeReason(),
                    value.activeAt(now));
        }
    }
}
