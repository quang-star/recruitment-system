package com.smartrecruitment.auth.user.application.port;

import com.smartrecruitment.auth.user.domain.AuthUser;
import java.time.Instant;
import java.util.List;

public interface AccessTokenIssuer {
    IssuedAccessToken issue(AuthUser user, List<String> roles, Instant issuedAt);
    default IssuedAccessToken issue(AuthUser user, List<String> roles, Long sessionId, Instant issuedAt) {
        return issue(user, roles, issuedAt);
    }
    record IssuedAccessToken(String value, Instant expiresAt) {}
}
