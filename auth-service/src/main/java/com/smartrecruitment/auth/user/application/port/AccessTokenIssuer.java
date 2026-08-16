package com.smartrecruitment.auth.user.application.port;

import com.smartrecruitment.auth.user.domain.AuthUser;
import java.time.Instant;
import java.util.List;

public interface AccessTokenIssuer {
    IssuedAccessToken issue(AuthUser user, List<String> roles, Instant issuedAt);
    record IssuedAccessToken(String value, Instant expiresAt) {}
}
