package com.smartrecruitment.auth.user.application;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.time.Duration;

@ConfigurationProperties(prefix = "auth")
public record AuthTokenProperties(Jwt jwt, Session session) {
    public Duration refreshTokenTtl() { return jwt.refreshTokenTtl(); }
    public Duration idleSessionTtl() { return session.idleTtl(); }
    public Duration absoluteSessionTtl() { return session.absoluteTtl(); }
    public record Jwt(String issuer, String audience, Duration accessTokenTtl, Duration refreshTokenTtl) {}
    public record Session(Duration idleTtl, Duration absoluteTtl) {}
}
