package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.PasswordCredentialRepository;
import com.smartrecruitment.auth.user.application.port.RefreshTokenRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.application.port.SessionRepository;
import com.smartrecruitment.auth.user.application.port.VerificationTokenGenerator;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
class AuthRefreshTokenReuseIntegrationTests {
    @Autowired private AuthAuthenticationService authentication;
    @Autowired private AuthUserRepository users;
    @Autowired private PasswordCredentialRepository credentials;
    @Autowired private RoleRepository roles;
    @Autowired private RefreshTokenRepository refreshTokens;
    @Autowired private SessionRepository sessions;
    @Autowired private VerificationTokenGenerator tokenGenerator;
    @Autowired private PasswordEncoder passwordEncoder;

    @Test
    void commitsSessionRevocationWhenAConsumedRefreshTokenIsReused() {
        Instant now = Instant.now();
        String email = "reuse-" + UUID.randomUUID() + "@example.com";
        String password = "correct horse battery staple";
        AuthUser user = users.insert(new AuthUser(
                null,
                UUID.randomUUID(),
                email,
                email,
                UserStatus.ACTIVE,
                now,
                null,
                now,
                now,
                0
        ));
        credentials.insert(user.id(), passwordEncoder.encode(password), now);
        roles.assignCandidateRole(user.id(), now);

        AuthenticationResult login = authentication.login(
                email, password, "WEB", "integration-test", "JUnit", "127.0.0.1");
        AuthenticationResult rotated = authentication.refresh(login.refreshToken(), "127.0.0.1");

        assertThatThrownBy(() -> authentication.refresh(login.refreshToken(), "127.0.0.1"))
                .isInstanceOf(InvalidRefreshTokenException.class);

        RefreshTokenRepository.RefreshToken consumedToken = refreshTokens
                .findByHash(tokenGenerator.hash(login.refreshToken()))
                .orElseThrow();
        SessionRepository.Session revokedSession = sessions.findById(consumedToken.sessionId()).orElseThrow();
        assertThat(revokedSession.revokedAt()).isNotNull();

        assertThatThrownBy(() -> authentication.refresh(rotated.refreshToken(), "127.0.0.1"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }
}
