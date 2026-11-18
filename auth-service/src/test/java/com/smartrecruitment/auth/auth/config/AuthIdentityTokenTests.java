package com.smartrecruitment.auth.auth.config;

import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.smartrecruitment.auth.user.application.AuthTokenProperties;
import com.smartrecruitment.auth.user.application.port.SessionRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.security.oauth2.jwt.JwsHeader;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthIdentityTokenTests {
    @Test
    void signsAndVerifiesTheFullBigintSubjectAndSessionIdWithoutChangingTheJwtId() throws Exception {
        var config = new AuthSecurityConfig();
        var key = new RSAKeyGenerator(2048).keyID("identity-test").generate();
        var properties = properties();
        var encoder = config.jwtEncoder(key);
        Instant now = Instant.now();
        var user = new AuthUser(Long.MAX_VALUE, "candidate@example.com", "candidate@example.com",
                UserStatus.ACTIVE, now, null, now, now, 0);

        var issued = config.accessTokenIssuer(encoder, key, properties).issue(user, List.of("CANDIDATE"), 77L, now);
        var decoded = config.jwtDecoder(key, properties).decode(issued.value());

        assertThat(decoded.getSubject()).isEqualTo("9223372036854775807");
        assertThat(decoded.getClaimAsString("sid")).isEqualTo("77");
        assertThat(decoded.getClaimAsStringList("roles")).containsExactly("CANDIDATE");
        assertThat(UUID.fromString(decoded.getId())).isNotNull();
    }

    @Test
    void rejectsTokensWhoseSessionWasRevoked() throws Exception {
        var config = new AuthSecurityConfig();
        var key = new RSAKeyGenerator(2048).keyID("identity-test").generate();
        var properties = properties();
        var encoder = config.jwtEncoder(key);
        Instant now = Instant.now();
        var user = new AuthUser(42L, "candidate@example.com", "candidate@example.com",
                UserStatus.ACTIVE, now, null, now, now, 0);
        var issued = config.accessTokenIssuer(encoder, key, properties).issue(user, List.of("CANDIDATE"), 99L, now);

        final Instant[] revokedAt = { null };
        SessionRepository sessions = new SessionRepository() {
            @Override
            public Session insert(Long userId, String clientType, String deviceName, String userAgent, String createdIp,
                                  Instant authenticatedAt, Instant idleExpiresAt, Instant absoluteExpiresAt) {
                throw new UnsupportedOperationException();
            }
            @Override
            public Optional<Session> findById(Long id) {
                if (!Long.valueOf(99L).equals(id)) return Optional.empty();
                return Optional.of(new Session(99L, 42L, now.plusSeconds(3600), now.plusSeconds(7200), revokedAt[0]));
            }
            @Override
            public boolean touch(Long id, String lastSeenIp, Instant lastSeenAt, Instant idleExpiresAt) { return false; }
            @Override
            public boolean revoke(Long id, String reason, Instant revoked) { return false; }
        };
        var decoder = config.jwtDecoder(key, properties, sessions, Clock.fixed(now, ZoneOffset.UTC));
        assertThat(decoder.decode(issued.value()).getClaimAsString("sid")).isEqualTo("99");

        revokedAt[0] = now;
        assertThatThrownBy(() -> decoder.decode(issued.value())).isInstanceOf(JwtValidationException.class);
    }

    @Test
    void rejectsSignedTokensWhoseSubjectIsNotACanonicalPositiveBigint() throws Exception {
        var config = new AuthSecurityConfig();
        var key = new RSAKeyGenerator(2048).keyID("identity-test").generate();
        var properties = properties();
        var encoder = config.jwtEncoder(key);
        var decoder = config.jwtDecoder(key, properties);
        for (String subject : List.of("0", "-1", "01", "9223372036854775808", UUID.randomUUID().toString())) {
            var claims = JwtClaimsSet.builder().issuer(properties.jwt().issuer())
                    .audience(List.of(properties.jwt().audience())).subject(subject)
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
            String token = encoder.encode(JwtEncoderParameters.from(
                    JwsHeader.with(SignatureAlgorithm.RS256).keyId(key.getKeyID()).build(), claims)).getTokenValue();
            assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtValidationException.class);
        }
    }

    private static AuthTokenProperties properties() {
        return new AuthTokenProperties(
                new AuthTokenProperties.Jwt("http://identity-test", "identity-api", Duration.ofMinutes(15), Duration.ofDays(30)),
                new AuthTokenProperties.Session(Duration.ofDays(7), Duration.ofDays(30)));
    }
}
