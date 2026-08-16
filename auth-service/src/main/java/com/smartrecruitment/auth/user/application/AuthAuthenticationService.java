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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

@Service
public class AuthAuthenticationService {
    private final AuthUserRepository users;
    private final PasswordCredentialRepository credentials;
    private final RoleRepository roles;
    private final SessionRepository sessions;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final VerificationTokenGenerator tokenGenerator;
    private final AccessTokenIssuer accessTokenIssuer;
    private final RefreshTokenReuseService refreshTokenReuse;
    private final Clock clock;
    private final Duration refreshTokenTtl;
    private final Duration idleSessionTtl;
    private final Duration absoluteSessionTtl;

    public AuthAuthenticationService(AuthUserRepository users, PasswordCredentialRepository credentials,
                                    RoleRepository roles, SessionRepository sessions,
                                    RefreshTokenRepository refreshTokens, PasswordEncoder passwordEncoder,
                                    VerificationTokenGenerator tokenGenerator, AccessTokenIssuer accessTokenIssuer,
                                    AuthTokenProperties properties,
                                    RefreshTokenReuseService refreshTokenReuse, Clock clock) {
        this.users = users;
        this.credentials = credentials;
        this.roles = roles;
        this.sessions = sessions;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.tokenGenerator = tokenGenerator;
        this.accessTokenIssuer = accessTokenIssuer;
        this.refreshTokenReuse = refreshTokenReuse;
        this.clock = clock;
        this.refreshTokenTtl = properties.refreshTokenTtl();
        this.idleSessionTtl = properties.idleSessionTtl();
        this.absoluteSessionTtl = properties.absoluteSessionTtl();
    }

    @Transactional
    public AuthenticationResult login(String email, String password, String clientType,
                                     String deviceName, String userAgent, String ipAddress) {
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        AuthUser user = users.findByNormalizedEmail(normalizedEmail).orElse(null);
        PasswordCredentialRepository.PasswordCredential credential = user == null ? null
                : credentials.findByUserId(user.id()).orElse(null);
        boolean passwordMatches = credential != null && passwordEncoder.matches(password, credential.passwordHash());
        Instant now = Instant.now(clock);
        if (!passwordMatches || user == null || user.status() != UserStatus.ACTIVE
                || credential.lockedUntil() != null && credential.lockedUntil().isAfter(now)) {
            throw new InvalidCredentialsException();
        }
        AuthUser loggedInUser = users.updateLastLogin(user.id(), now).orElseThrow(InvalidCredentialsException::new);
        return issueSession(loggedInUser, clientType, deviceName, userAgent, ipAddress, now);
    }

    @Transactional
    public AuthenticationResult refresh(String rawRefreshToken, String ipAddress) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) throw new InvalidRefreshTokenException();
        Instant now = Instant.now(clock);
        RefreshTokenRepository.RefreshToken current = refreshTokens.findByHash(tokenGenerator.hash(rawRefreshToken))
                .orElseThrow(InvalidRefreshTokenException::new);
        if (!current.activeAt(now)) {
            if (current.usedAt() != null) refreshTokenReuse.revokeSession(current.sessionId(), now);
            throw new InvalidRefreshTokenException();
        }
        SessionRepository.Session session = sessions.findById(current.sessionId())
                .filter(value -> value.revokedAt() == null)
                .filter(value -> value.idleExpiresAt().isAfter(now))
                .filter(value -> value.absoluteExpiresAt().isAfter(now))
                .orElseThrow(InvalidRefreshTokenException::new);
        AuthUser user = users.findById(session.userId()).filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(InvalidRefreshTokenException::new);
        String rawReplacement = tokenGenerator.generate();
        Instant replacementExpiresAt = now.plus(refreshTokenTtl);
        RefreshTokenRepository.RefreshToken replacement = refreshTokens.insert(session.id(),
                tokenGenerator.hash(rawReplacement), current.id(), now, replacementExpiresAt);
        if (!refreshTokens.markUsedAndReplaced(current.id(), now, replacement.id())) {
            refreshTokenReuse.revokeSession(session.id(), now);
            throw new InvalidRefreshTokenException();
        }
        Instant nextIdleExpiry = now.plus(idleSessionTtl).isBefore(session.absoluteExpiresAt())
                ? now.plus(idleSessionTtl) : session.absoluteExpiresAt();
        sessions.touch(session.id(), ipAddress, now, nextIdleExpiry);
        List<String> roleCodes = roles.findActiveRoleCodes(user.id());
        AccessTokenIssuer.IssuedAccessToken accessToken = accessTokenIssuer.issue(user, roleCodes, now);
        return new AuthenticationResult(user.publicId(), accessToken.value(), rawReplacement,
                accessToken.expiresAt(), replacementExpiresAt, roleCodes);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) return;
        refreshTokens.findByHash(tokenGenerator.hash(rawRefreshToken))
                .ifPresent(token -> sessions.revoke(token.sessionId(), "USER_LOGOUT", Instant.now(clock)));
    }

    private AuthenticationResult issueSession(AuthUser user, String clientType, String deviceName,
                                              String userAgent, String ipAddress, Instant now) {
        String resolvedClientType = clientType == null || clientType.isBlank() ? "WEB" : clientType;
        Instant absoluteExpiresAt = now.plus(absoluteSessionTtl);
        Instant refreshExpiresAt = now.plus(refreshTokenTtl);
        SessionRepository.Session session = sessions.insert(user.id(), resolvedClientType, deviceName, userAgent,
                ipAddress, now, now.plus(idleSessionTtl), absoluteExpiresAt);
        String rawRefreshToken = tokenGenerator.generate();
        refreshTokens.insert(session.id(), tokenGenerator.hash(rawRefreshToken), null, now, refreshExpiresAt);
        List<String> roleCodes = roles.findActiveRoleCodes(user.id());
        AccessTokenIssuer.IssuedAccessToken accessToken = accessTokenIssuer.issue(user, roleCodes, now);
        return new AuthenticationResult(user.publicId(), accessToken.value(), rawRefreshToken,
                accessToken.expiresAt(), refreshExpiresAt, roleCodes);
    }
}
