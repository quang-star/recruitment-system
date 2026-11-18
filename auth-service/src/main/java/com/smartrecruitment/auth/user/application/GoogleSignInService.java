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
    public GoogleLoginResult login(String credential, String nonce, String accountType,
                                   String userAgent, String ipAddress) {
        GoogleIdentityVerifier.VerifiedIdentity identity = verifier.verify(credential, nonce);
        Instant now = clock.instant();
        consume(nonce, now);
        Long userId = identities.findUserId(identity.subject()).orElse(null);
        boolean newAccount = userId == null;
        if (newAccount) {
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
        AuthenticationResult session = authentication.loginVerifiedIdentity(userId, userAgent, ipAddress);
        GoogleProfileHint googleProfile = new GoogleProfileHint(
                resolveDisplayName(identity),
                identity.pictureUrl(),
                identity.email().trim());
        return new GoogleLoginResult(session, newAccount, googleProfile);
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

    private static String resolveDisplayName(GoogleIdentityVerifier.VerifiedIdentity identity) {
        if (identity.name() != null && !identity.name().isBlank()) {
            String normalized = truncate(identity.name().trim(), 120);
            if (!normalized.isBlank()) return normalized;
        }
        String email = identity.email() == null ? "" : identity.email().trim();
        int at = email.indexOf('@');
        if (at > 0) {
            String localPart = truncate(email.substring(0, at).trim(), 120);
            if (!localPart.isBlank()) return localPart;
        }
        return "Người dùng";
    }

    private static String truncate(String value, int maxLength) {
        if (value.length() <= maxLength) return value;
        int end = Character.isHighSurrogate(value.charAt(maxLength - 1)) ? maxLength - 1 : maxLength;
        return value.substring(0, end).trim();
    }

    public record Challenge(String nonce, Instant expiresAt) {}
    public record GoogleProfileHint(String displayName, String avatarUrl, String email) {}
    public record GoogleLoginResult(AuthenticationResult session, boolean newAccount, GoogleProfileHint googleProfile) {}
}
