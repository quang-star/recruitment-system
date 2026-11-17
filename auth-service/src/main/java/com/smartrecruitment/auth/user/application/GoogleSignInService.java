package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.GoogleIdentityRepository;
import com.smartrecruitment.auth.user.application.port.GoogleIdentityVerifier;
import com.smartrecruitment.auth.user.application.port.GoogleLoginChallengeRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.application.port.VerificationTokenGenerator;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

import static com.smartrecruitment.auth.user.application.GoogleSignInException.Reason.*;

@Service
public class GoogleSignInService {
    private final GoogleIdentityVerifier verifier;
    private final GoogleIdentityRepository identities;
    private final GoogleLoginChallengeRepository challenges;
    private final AuthUserRepository users;
    private final RoleRepository roles;
    private final VerificationTokenGenerator tokens;
    private final AuthAuthenticationService authentication;
    private final Clock clock;

    public GoogleSignInService(GoogleIdentityVerifier verifier, GoogleIdentityRepository identities,
                               GoogleLoginChallengeRepository challenges, AuthUserRepository users,
                               RoleRepository roles, VerificationTokenGenerator tokens,
                               AuthAuthenticationService authentication, Clock clock) {
        this.verifier = verifier;
        this.identities = identities;
        this.challenges = challenges;
        this.users = users;
        this.roles = roles;
        this.tokens = tokens;
        this.authentication = authentication;
        this.clock = clock;
    }

    public String clientId() { return verifier.clientId(); }

    @Transactional
    public Challenge challenge() {
        if (clientId().isBlank()) throw new GoogleSignInException(NOT_CONFIGURED);
        Instant now = clock.instant();
        String nonce = tokens.generate();
        Instant expiresAt = now.plus(Duration.ofMinutes(5));
        challenges.insert(tokens.hash(nonce), expiresAt, now);
        return new Challenge(nonce, expiresAt);
    }

    @Transactional
    public AuthenticationResult login(String credential, String nonce, String accountType,
                                      String userAgent, String ipAddress) {
        GoogleIdentityVerifier.VerifiedIdentity identity = verifier.verify(credential, nonce);
        Instant now = clock.instant();
        consume(nonce, now);
        Long userId = identities.findUserId(identity.subject()).orElse(null);
        if (userId == null) {
            String normalizedEmail = identity.email().trim().toLowerCase(Locale.ROOT);
            if (users.existsByNormalizedEmail(normalizedEmail)) throw new GoogleSignInException(LINK_REQUIRED);
            String role = accountType == null ? "CANDIDATE" : accountType;
            if (!role.equals("CANDIDATE") && !role.equals("RECRUITER")) {
                throw new IllegalArgumentException("Unsupported account type");
            }
            userId = users.insert(AuthUser.verified(identity.email(), now)).id();
            if (role.equals("RECRUITER")) roles.assignRecruiterRole(userId, now);
            else roles.assignCandidateRole(userId, now);
            if (!identities.link(identity.subject(), userId)) throw new GoogleSignInException(ACCOUNT_CONFLICT);
        }
        // Existing identities keep their roles, account email and ID even if Google email changes.
        return authentication.loginVerifiedIdentity(userId, userAgent, ipAddress);
    }

    @Transactional
    public void link(Long userId, String credential, String nonce) {
        GoogleIdentityVerifier.VerifiedIdentity identity = verifier.verify(credential, nonce);
        AuthUser user = users.findById(userId)
                .filter(value -> value.status() == UserStatus.ACTIVE && value.emailVerifiedAt() != null)
                .orElseThrow(CurrentUserUnavailableException::new);
        if (!user.normalizedEmail().equals(identity.email().trim().toLowerCase(Locale.ROOT))) {
            throw new GoogleSignInException(ACCOUNT_CONFLICT);
        }
        consume(nonce, clock.instant());
        Long linkedUser = identities.findUserId(identity.subject()).orElse(null);
        if (user.id().equals(linkedUser)) return;
        if (linkedUser != null || !identities.link(identity.subject(), user.id())) {
            throw new GoogleSignInException(ACCOUNT_CONFLICT);
        }
    }

    private void consume(String nonce, Instant now) {
        if (!challenges.consume(tokens.hash(nonce), now)) throw new GoogleSignInException(INVALID_TOKEN);
    }

    public record Challenge(String nonce, Instant expiresAt) {}
}
