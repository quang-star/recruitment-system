package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.*;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GoogleSignInServiceTests {
    private static final Instant NOW = Instant.parse("2026-10-15T08:00:00Z");
    private final GoogleIdentityVerifier verifier = mock(GoogleIdentityVerifier.class);
    private final GoogleIdentityRepository identities = mock(GoogleIdentityRepository.class);
    private final GoogleLoginChallengeRepository challenges = mock(GoogleLoginChallengeRepository.class);
    private final AuthUserRepository users = mock(AuthUserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final VerificationTokenGenerator tokens = mock(VerificationTokenGenerator.class);
    private final AuthAuthenticationService authentication = mock(AuthAuthenticationService.class);
    private final GoogleSignInService service = new GoogleSignInService(verifier, identities, challenges, users,
            roles, tokens, authentication, Clock.fixed(NOW, ZoneOffset.UTC));

    @BeforeEach
    void configure() {
        when(verifier.clientId()).thenReturn("client-id");
        when(verifier.verify("credential", "nonce"))
                .thenReturn(new GoogleIdentityVerifier.VerifiedIdentity("subject", "Candidate@Example.com"));
        when(tokens.generate()).thenReturn("nonce");
        when(tokens.hash("nonce")).thenReturn("nonce-hash");
        when(challenges.consume("nonce-hash", NOW)).thenReturn(true);
        when(identities.link(eq("subject"), anyLong())).thenReturn(true);
        when(users.insert(any())).thenAnswer(invocation -> persisted(invocation.getArgument(0)));
    }

    @Test
    void createsVerifiedCandidateWithNoPasswordAndReusesExistingSessions() {
        service.login("credential", "nonce", null, "browser", "127.0.0.1");
        ArgumentCaptor<AuthUser> saved = ArgumentCaptor.forClass(AuthUser.class);
        verify(users).insert(saved.capture());
        assertThat(saved.getValue().status()).isEqualTo(UserStatus.ACTIVE);
        assertThat(saved.getValue().emailVerifiedAt()).isEqualTo(NOW);
        assertThat(saved.getValue().normalizedEmail()).isEqualTo("candidate@example.com");
        verify(roles).assignCandidateRole(1L, NOW);
        verify(authentication).loginVerifiedIdentity(1L, "browser", "127.0.0.1");
    }

    @Test
    void newRecruiterGetsOnlyRequestedAllowedRole() {
        service.login("credential", "nonce", "RECRUITER", null, null);
        verify(roles).assignRecruiterRole(1L, NOW);
        verify(roles, never()).assignCandidateRole(anyLong(), any());
    }

    @Test
    void returningIdentityKeepsRoleAndDoesNotRelinkByChangedEmail() {
        when(identities.findUserId("subject")).thenReturn(Optional.of(42L));
        service.login("credential", "nonce", "RECRUITER", null, null);
        verify(authentication).loginVerifiedIdentity(42L, null, null);
        verifyNoInteractions(roles, users);
    }

    @Test
    void emailCollisionRequiresAuthenticatedLinkAndNeverIssuesSession() {
        when(users.existsByNormalizedEmail("candidate@example.com")).thenReturn(true);
        assertThatThrownBy(() -> service.login("credential", "nonce", null, null, null))
                .isInstanceOf(GoogleSignInException.class).hasMessageContaining("hiện có");
        verifyNoInteractions(authentication, roles);
        verify(users, never()).insert(any());
    }

    @Test
    void invalidOrReplayedChallengeCannotCreateAccountsOrSessions() {
        when(challenges.consume("nonce-hash", NOW)).thenReturn(false);
        assertThatThrownBy(() -> service.login("credential", "nonce", null, null, null))
                .isInstanceOf(GoogleSignInException.class);
        verifyNoInteractions(users, roles, authentication, identities);
    }

    @Test
    void authenticatedAccountCanLinkSameVerifiedEmail() {
        AuthUser user = persisted(AuthUser.verified("candidate@example.com", NOW));
        when(users.findById(user.id())).thenReturn(Optional.of(user));
        service.link(user.id(), "credential", "nonce");
        verify(identities).link("subject", user.id());
        verifyNoInteractions(authentication, roles);
    }

    @Test
    void cannotLinkAnotherEmailOrStealAnAlreadyLinkedGoogleAccount() {
        AuthUser other = persisted(AuthUser.verified("other@example.com", NOW));
        when(users.findById(other.id())).thenReturn(Optional.of(other));
        assertThatThrownBy(() -> service.link(other.id(), "credential", "nonce"))
                .isInstanceOf(GoogleSignInException.class);
        AuthUser user = persisted(AuthUser.verified("candidate@example.com", NOW));
        when(users.findById(user.id())).thenReturn(Optional.of(user));
        when(identities.findUserId("subject")).thenReturn(Optional.of(99L));
        assertThatThrownBy(() -> service.link(user.id(), "credential", "nonce"))
                .isInstanceOf(GoogleSignInException.class);
        verify(identities, never()).link(anyString(), anyLong());
    }

    @Test
    void createsFiveMinuteChallengeAndStoresOnlyItsDigest() {
        var challenge = service.challenge();
        assertThat(challenge.nonce()).isEqualTo("nonce");
        assertThat(challenge.expiresAt()).isEqualTo(NOW.plusSeconds(300));
        verify(challenges).insert("nonce-hash", NOW.plusSeconds(300), NOW);
    }

    private AuthUser persisted(AuthUser user) {
        return new AuthUser(1L, user.email(), user.normalizedEmail(), user.status(),
                user.emailVerifiedAt(), null, user.createdAt(), user.updatedAt(), 0);
    }
}
