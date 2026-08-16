package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AccessTokenIssuer;
import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.PasswordCredentialRepository;
import com.smartrecruitment.auth.user.application.port.RefreshTokenRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.application.port.SessionRepository;
import com.smartrecruitment.auth.user.application.port.VerificationTokenGenerator;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthAuthenticationServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-03T08:00:00Z");

    @Test
    void logsInActiveUserAndIssuesAccessAndRefreshTokens() {
        Fixtures fixtures = new Fixtures(UserStatus.ACTIVE);
        AuthenticationResult result = fixtures.service().login(
                "Candidate@Example.com", "correct horse battery", "WEB", "Chrome", "test-agent", "127.0.0.1");

        assertThat(result.userId()).isEqualTo(fixtures.user.publicId());
        assertThat(result.accessToken()).isEqualTo("access-token");
        assertThat(result.refreshToken()).isEqualTo("refresh-token-1");
        assertThat(result.roles()).containsExactly("CANDIDATE");
        assertThat(fixtures.sessionCreated).isTrue();
        assertThat(fixtures.insertedRefreshTokens).hasSize(1);
    }

    @Test
    void rotatesRefreshTokenAndRevokesSessionOnReuse() {
        Fixtures fixtures = new Fixtures(UserStatus.ACTIVE);
        AuthAuthenticationService service = fixtures.service();
        service.login("candidate@example.com", "correct horse battery", "WEB", null, null, null);

        AuthenticationResult rotated = service.refresh("refresh-token-1", "127.0.0.1");
        assertThat(rotated.refreshToken()).isEqualTo("refresh-token-2");
        assertThat(fixtures.oldTokenUsed).isTrue();

        assertThatThrownBy(() -> service.refresh("refresh-token-1", "127.0.0.1"))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThat(fixtures.revokedReason).isEqualTo("REFRESH_TOKEN_REUSE");
    }

    @Test
    void rejectsLoginForPendingUser() {
        Fixtures fixtures = new Fixtures(UserStatus.PENDING);
        assertThatThrownBy(() -> fixtures.service().login(
                "candidate@example.com", "correct horse battery", "WEB", null, null, null))
                .isInstanceOf(InvalidCredentialsException.class);
    }

    private static final class Fixtures {
        private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
        private final AuthUser user;
        private final List<RefreshTokenRepository.RefreshToken> insertedRefreshTokens = new ArrayList<>();
        private boolean sessionCreated;
        private boolean oldTokenUsed;
        private String revokedReason;
        private int nextToken = 1;

        private Fixtures(UserStatus status) {
            this.user = new AuthUser(1L, UUID.randomUUID(), "candidate@example.com", "candidate@example.com",
                    status, status == UserStatus.ACTIVE ? NOW : null, null, NOW, NOW, 0);
        }

        private AuthAuthenticationService service() {
            AuthUserRepository users = new AuthUserRepository() {
                public AuthUser insert(AuthUser value) { return value; }
                public Optional<AuthUser> findByNormalizedEmail(String value) { return Optional.of(user); }
                public Optional<AuthUser> findByPublicId(UUID value) { return Optional.of(user); }
                public Optional<AuthUser> findById(Long value) { return Optional.of(user); }
                public boolean existsByNormalizedEmail(String value) { return true; }
                public Optional<AuthUser> activateById(Long id, Instant verifiedAt) { return Optional.of(user); }
                public Optional<AuthUser> updateLastLogin(Long id, Instant lastLoginAt) { return Optional.of(user); }
            };
            PasswordCredentialRepository credentials = new PasswordCredentialRepository() {
                public void insert(Long userId, String passwordHash, Instant createdAt) {}
                public Optional<PasswordCredential> findByUserId(Long userId) {
                    return Optional.of(new PasswordCredential(encoder.encode("correct horse battery"), null, false));
                }
            };
            RoleRepository roles = userId -> List.of("CANDIDATE");
            SessionRepository sessions = new SessionRepository() {
                public Session insert(Long userId, String clientType, String deviceName, String userAgent,
                                      String createdIp, Instant authenticatedAt, Instant idleExpiresAt, Instant absoluteExpiresAt) {
                    sessionCreated = true;
                    return new Session(10L, UUID.randomUUID(), userId, idleExpiresAt, absoluteExpiresAt, null);
                }
                public Optional<Session> findById(Long id) {
                    return Optional.of(new Session(10L, UUID.randomUUID(), user.id(), NOW.plus(Duration.ofDays(7)),
                            NOW.plus(Duration.ofDays(30)), revokedReason == null ? null : NOW));
                }
                public boolean touch(Long id, String ip, Instant seenAt, Instant idleExpiresAt) { return true; }
                public boolean revoke(Long id, String reason, Instant revokedAt) { revokedReason = reason; return true; }
            };
            RefreshTokenRepository refreshTokens = new RefreshTokenRepository() {
                public RefreshToken insert(Long sessionId, String hash, Long parentId, Instant issuedAt, Instant expiresAt) {
                    RefreshToken token = new RefreshToken((long) nextToken, UUID.randomUUID(), sessionId, user.id(), hash,
                            expiresAt, null, null, revokedReason == null ? null : NOW);
                    nextToken++;
                    insertedRefreshTokens.add(token);
                    return token;
                }
                public Optional<RefreshToken> findByHash(String hash) {
                    return insertedRefreshTokens.stream().filter(value -> value.tokenHash().equals(hash)).findFirst().map(value -> oldTokenUsed && Long.valueOf(1L).equals(value.id()) ? new RefreshToken(value.id(), value.publicId(), value.sessionId(), value.userId(), value.tokenHash(), value.expiresAt(), NOW, value.revokedAt(), value.sessionRevokedAt()) : value);
                }
                public boolean markUsedAndReplaced(Long id, Instant usedAt, Long replacementId) {
                    oldTokenUsed = true;
                    return true;
                }
            };
            VerificationTokenGenerator tokens = new VerificationTokenGenerator() {
                public String generate() { return "refresh-token-" + nextToken; }
                public String hash(String rawToken) { return rawToken; }
            };
            AccessTokenIssuer issuer = (value, roleCodes, issuedAt) ->
                    new AccessTokenIssuer.IssuedAccessToken("access-token", issuedAt.plus(Duration.ofMinutes(15)));
            AuthTokenProperties properties = new AuthTokenProperties(
                    new AuthTokenProperties.Jwt("http://test", "smart-recruitment-api", Duration.ofMinutes(15), Duration.ofDays(30)),
                    new AuthTokenProperties.Session(Duration.ofDays(7), Duration.ofDays(30)));
            return new AuthAuthenticationService(users, credentials, roles, sessions, refreshTokens,
                    encoder, tokens, issuer, properties, new RefreshTokenReuseService(sessions),
                    Clock.fixed(NOW, ZoneOffset.UTC));
        }
    }
}
