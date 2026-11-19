package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import com.smartrecruitment.auth.user.application.port.*;
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
    @Autowired private AuthCurrentUserService currentUsers;
    @Autowired private RoleRepository roles;
    @Autowired private PasswordEncoder passwordEncoder;
    @MockitoBean private GoogleIdentityVerifier verifier;

    @Test
    void loginIsAtomicSingleUseAndReturningIdentityCannotUpgradeItsRole() {
        String email = "google-" + UUID.randomUUID() + "@example.com";
        String subject = UUID.randomUUID().toString();
        when(verifier.clientId()).thenReturn("client");
        when(verifier.verify(eq(subject), anyString()))
                .thenReturn(new GoogleIdentityVerifier.VerifiedIdentity(
                        subject, email, "Trần Văn Bình", "https://lh3.googleusercontent.com/a/binh"));
        var challenge = google.challenge();
        GoogleSignInService.GoogleLoginResult result = google.login(subject, challenge.nonce(), "CANDIDATE", "JUnit", "127.0.0.1");
        AuthenticationResult login = result.session();
        assertThat(result.newAccount()).isTrue();
        assertThat(result.googleProfile()).isEqualTo(new GoogleSignInService.GoogleProfileHint(
                "Trần Văn Bình", "https://lh3.googleusercontent.com/a/binh", email));
        assertThat(login.roles()).containsExactly("CANDIDATE");
        assertThat(credentials.findByUserId(identities.findUserId(subject).orElseThrow())).isEmpty();
        CurrentUserResult currentUser = currentUsers.get(login.userId());
        assertThat(currentUser.hasPassword()).isFalse();
        assertThat(currentUser.googleLinked()).isTrue();
        assertThat(authentication.refresh(login.refreshToken(), null).accessToken()).isNotBlank();
        assertThatThrownBy(() -> google.login(subject, challenge.nonce(), "RECRUITER", null, null))
                .isInstanceOf(GoogleSignInException.class);
        var second = google.login(subject, google.challenge().nonce(), "RECRUITER", null, null);
        assertThat(second.newAccount()).isFalse();
        assertThat(second.session().userId()).isEqualTo(login.userId());
        assertThat(second.session().roles()).containsExactly("CANDIDATE");
    }

    @Test
    void verifiedActiveAccountAutoLinksByEmailAndKeepsPassword() {
        Instant now = Instant.now();
        String verifiedEmail = "verified-" + UUID.randomUUID() + "@example.com";
        String verifiedSubject = UUID.randomUUID().toString();
        AuthUser verifiedUser = users.insert(AuthUser.verified(verifiedEmail, now));
        roles.assignRecruiterRole(verifiedUser.id(), now);
        credentials.insert(verifiedUser.id(), passwordEncoder.encode("existing-password"), now);

        when(verifier.clientId()).thenReturn("client");
        when(verifier.verify(eq(verifiedSubject), anyString()))
                .thenReturn(new GoogleIdentityVerifier.VerifiedIdentity(verifiedSubject, verifiedEmail, null, null, true));

        GoogleSignInService.GoogleLoginResult linkedLogin =
                google.login(verifiedSubject, google.challenge().nonce(), "CANDIDATE", "JUnit", "127.0.0.1");
        assertThat(linkedLogin.newAccount()).isFalse();
        assertThat(linkedLogin.session().userId()).isEqualTo(verifiedUser.id());
        assertThat(linkedLogin.session().roles()).containsExactly("RECRUITER");
        assertThat(identities.findUserId(verifiedSubject)).contains(verifiedUser.id());
        assertThat(currentUsers.get(verifiedUser.id()).hasPassword()).isTrue();
    }

    @Test
    void googleActivatesPendingAccountAndRemovesRegistrationPassword() {
        Instant now = Instant.now();
        String pendingEmail = "pending-" + UUID.randomUUID() + "@example.com";
        String pendingSubject = UUID.randomUUID().toString();
        AuthUser pending = users.insert(AuthUser.pending(pendingEmail));
        roles.assignCandidateRole(pending.id(), now);
        credentials.insert(pending.id(), passwordEncoder.encode("registration-password"), now);
        when(verifier.clientId()).thenReturn("client");
        when(verifier.verify(eq(pendingSubject), anyString()))
                .thenReturn(new GoogleIdentityVerifier.VerifiedIdentity(pendingSubject, pendingEmail, null, null, true));

        var login = google.login(pendingSubject, google.challenge().nonce(), "RECRUITER", null, null);

        assertThat(login.newAccount()).isFalse();
        assertThat(login.session().userId()).isEqualTo(pending.id());
        assertThat(login.session().roles()).containsExactly("CANDIDATE");
        AuthUser activated = users.findById(pending.id()).orElseThrow();
        assertThat(activated.status()).isEqualTo(UserStatus.ACTIVE);
        assertThat(activated.emailVerifiedAt()).isNotNull();
        assertThat(identities.findUserId(pendingSubject)).contains(pending.id());
        assertThat(credentials.findByUserId(pending.id())).isEmpty();
        assertThatThrownBy(() -> authentication.login(pendingEmail, "registration-password", "WEB", null, null, null))
                .isInstanceOf(InvalidCredentialsException.class);
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
