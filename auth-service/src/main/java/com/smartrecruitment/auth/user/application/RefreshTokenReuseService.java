package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.SessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class RefreshTokenReuseService {
    private static final String REVOKE_REASON = "REFRESH_TOKEN_REUSE";

    private final SessionRepository sessions;

    public RefreshTokenReuseService(SessionRepository sessions) {
        this.sessions = sessions;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void revokeSession(Long sessionId, Instant revokedAt) {
        sessions.revoke(sessionId, REVOKE_REASON, revokedAt);
    }
}
