package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.PasswordCredentialRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.application.port.VerificationEmailSender;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
class AuthAccountRecoveryIntegrationTests {
    @Autowired private AuthAccountRecoveryService recovery;
    @Autowired private AuthSessionManagementService sessionManagement;
    @Autowired private AuthAuthenticationService authentication;
    @Autowired private AuthUserRepository users;
    @Autowired private PasswordCredentialRepository credentials;
    @Autowired private RoleRepository roles;
    @Autowired private PasswordEncoder passwordEncoder;

    @MockitoBean
    private VerificationEmailSender emailSender;

    @Test
    void resetsPasswordAndRevokesEveryExistingSession() {
        String email = "reset-" + UUID.randomUUID() + "@example.com";
        String oldPassword = "old password for integration";
        String newPassword = "new password for integration";
        AuthUser user = activeUser(email);
        credentials.insert(user.id(), passwordEncoder.encode(oldPassword), Instant.now());
        roles.assignCandidateRole(user.id(), Instant.now());

        AuthenticationResult first = authentication.login(
                email, oldPassword, "WEB", "First browser", "JUnit", "127.0.0.1");
        authentication.login(email, oldPassword, "MOBILE", "Phone", "JUnit", "127.0.0.2");

        recovery.forgotPassword(email);
        var token = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendPasswordReset(eq(email), token.capture(), any());
        recovery.resetPassword(token.getValue(), newPassword);

        assertThatThrownBy(() -> authentication.login(
                email, oldPassword, "WEB", "Old password", "JUnit", "127.0.0.1"))
                .isInstanceOf(InvalidCredentialsException.class);
        assertThatThrownBy(() -> authentication.refresh(first.refreshToken(), "127.0.0.1"))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThat(sessionManagement.list(user.id()))
                .hasSize(2)
                .allMatch(session -> !session.active() && "PASSWORD_RESET".equals(session.revokeReason()));
        assertThat(authentication.login(
                email, newPassword, "WEB", "New password", "JUnit", "127.0.0.1").accessToken())
                .isNotBlank();
    }

    @Test
    void listsAndRevokesOnlyTheOwnersSession() {
        String email = "sessions-" + UUID.randomUUID() + "@example.com";
        String password = "session password integration";
        AuthUser user = activeUser(email);
        credentials.insert(user.id(), passwordEncoder.encode(password), Instant.now());
        roles.assignCandidateRole(user.id(), Instant.now());
        AuthenticationResult login = authentication.login(
                email, password, "WEB", "Demo browser", "JUnit", "127.0.0.1");

        var session = sessionManagement.list(user.id()).getFirst();
        assertThat(session.active()).isTrue();
        assertThat(session.deviceName()).isEqualTo("Demo browser");

        sessionManagement.revoke(user.id(), Long.valueOf(session.sessionId()));

        assertThat(sessionManagement.list(user.id()).getFirst().active()).isFalse();
        assertThatThrownBy(() -> authentication.refresh(login.refreshToken(), "127.0.0.1"))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThatThrownBy(() -> sessionManagement.revoke(user.id(), Long.valueOf(session.sessionId())))
                .isInstanceOf(SessionNotFoundException.class);
    }

    private AuthUser activeUser(String email) {
        Instant now = Instant.now();
        return users.insert(new AuthUser(null, email, email, UserStatus.ACTIVE,
                now, null, now, now, 0));
    }

    @Test
    void verifiedGoogleOnlyUserCanCreatePasswordViaEmailRecovery() {
        String email = "google-password-" + UUID.randomUUID() + "@example.com";
        AuthUser user = activeUser(email);
        roles.assignCandidateRole(user.id(), Instant.now());
        AuthenticationResult login = authentication.loginVerifiedIdentity(user.id(), "JUnit", null);
        recovery.forgotPassword(email);
        var token = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(emailSender).sendPasswordReset(eq(email), token.capture(), any());
        recovery.resetPassword(token.getValue(), "NewGooglePassword!2026");
        assertThat(authentication.login(email, "NewGooglePassword!2026", "WEB", null, null, null).accessToken())
                .isNotBlank();
        assertThatThrownBy(() -> authentication.refresh(login.refreshToken(), null))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThatThrownBy(() -> recovery.resetPassword(token.getValue(), "AnotherPassword!2026"))
                .isInstanceOf(InvalidPasswordResetTokenException.class);
    }
}
