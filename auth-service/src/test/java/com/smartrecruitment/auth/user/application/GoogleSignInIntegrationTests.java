package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import com.smartrecruitment.auth.user.application.port.*;
import com.smartrecruitment.auth.user.domain.AuthUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
class GoogleSignInIntegrationTests {
    @Autowired private GoogleSignInService google;
    @Autowired private AuthAuthenticationService authentication;
    @Autowired private AuthUserRepository users;
    @Autowired private PasswordCredentialRepository credentials;
    @Autowired private GoogleIdentityRepository identities;
    @Autowired private GoogleLoginChallengeRepository challenges;
    @Autowired private VerificationTokenGenerator tokens;
    @MockitoBean private GoogleIdentityVerifier verifier;

    @Test
    void loginIsAtomicSingleUseAndReturningIdentityCannotUpgradeItsRole() {
        String email = "google-" + UUID.randomUUID() + "@example.com";
        String subject = UUID.randomUUID().toString();
        when(verifier.clientId()).thenReturn("client");
        when(verifier.verify(eq(subject), anyString()))
                .thenReturn(new GoogleIdentityVerifier.VerifiedIdentity(subject, email));
        var challenge = google.challenge();
        AuthenticationResult login = google.login(subject, challenge.nonce(), "CANDIDATE", "JUnit", "127.0.0.1");
        assertThat(login.roles()).containsExactly("CANDIDATE");
        assertThat(credentials.findByUserId(identities.findUserId(subject).orElseThrow())).isEmpty();
        assertThat(authentication.refresh(login.refreshToken(), null).accessToken()).isNotBlank();
        assertThatThrownBy(() -> google.login(subject, challenge.nonce(), "RECRUITER", null, null))
                .isInstanceOf(GoogleSignInException.class);
        var second = google.login(subject, google.challenge().nonce(), "RECRUITER", null, null);
        assertThat(second.userId()).isEqualTo(login.userId());
        assertThat(second.roles()).containsExactly("CANDIDATE");
    }

    @Test
    void emailCollisionCannotTakeOverExistingAccountButAuthenticatedUserCanLink() {
        String email = "link-" + UUID.randomUUID() + "@example.com";
        String subject = UUID.randomUUID().toString();
        AuthUser user = users.insert(AuthUser.verified(email, Instant.now()));
        when(verifier.clientId()).thenReturn("client");
        when(verifier.verify(eq(subject), anyString()))
                .thenReturn(new GoogleIdentityVerifier.VerifiedIdentity(subject, email));
        assertThatThrownBy(() -> google.login(subject, google.challenge().nonce(), "CANDIDATE", null, null))
                .isInstanceOf(GoogleSignInException.class).hasMessageContaining("hiện có");
        assertThat(identities.findUserId(subject)).isEmpty();
        var challenge = google.challenge();
        google.link(user.id(), subject, challenge.nonce());
        assertThat(identities.findUserId(subject)).contains(user.id());
        assertThatThrownBy(() -> google.link(user.id(), subject, challenge.nonce()))
                .isInstanceOf(GoogleSignInException.class);
    }

    @Test
    void expiredChallengesCannotBeConsumedAndIdentityOwnershipIsUnique() {
        Instant now = Instant.now();
        String hash = tokens.hash(UUID.randomUUID().toString());
        challenges.insert(hash, now.minusSeconds(1), now.minusSeconds(300));
        assertThat(challenges.consume(hash, now)).isFalse();
        AuthUser first = users.insert(AuthUser.verified(UUID.randomUUID() + "@example.com", now));
        AuthUser second = users.insert(AuthUser.verified(UUID.randomUUID() + "@example.com", now));
        String subject = UUID.randomUUID().toString();
        assertThat(identities.link(subject, first.id())).isTrue();
        assertThat(identities.link(subject, second.id())).isFalse();
        assertThat(identities.link(UUID.randomUUID().toString(), first.id())).isFalse();
    }
}
