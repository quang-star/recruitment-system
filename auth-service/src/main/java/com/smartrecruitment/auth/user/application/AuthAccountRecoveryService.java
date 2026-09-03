package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.OneTimeTokenRepository;
import com.smartrecruitment.auth.user.application.port.PasswordCredentialRepository;
import com.smartrecruitment.auth.user.application.port.SessionRepository;
import com.smartrecruitment.auth.user.application.port.VerificationEmailSender;
import com.smartrecruitment.auth.user.application.port.VerificationTokenGenerator;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Service
public class AuthAccountRecoveryService {
    private static final Logger log = LoggerFactory.getLogger(AuthAccountRecoveryService.class);
    private static final String EMAIL_VERIFICATION = "EMAIL_VERIFICATION";
    private static final String PASSWORD_RESET = "PASSWORD_RESET";
    private static final Duration EMAIL_TOKEN_TTL = Duration.ofMinutes(15);
    private static final Duration PASSWORD_RESET_TTL = Duration.ofMinutes(30);
    private static final Duration REQUEST_COOLDOWN = Duration.ofMinutes(1);

    private final AuthUserRepository users;
    private final PasswordCredentialRepository credentials;
    private final OneTimeTokenRepository tokens;
    private final SessionRepository sessions;
    private final PasswordEncoder passwordEncoder;
    private final VerificationTokenGenerator tokenGenerator;
    private final VerificationEmailSender emailSender;
    private final Clock clock;

    public AuthAccountRecoveryService(AuthUserRepository users, PasswordCredentialRepository credentials,
                                      OneTimeTokenRepository tokens, SessionRepository sessions,
                                      PasswordEncoder passwordEncoder, VerificationTokenGenerator tokenGenerator,
                                      VerificationEmailSender emailSender, Clock clock) {
        this.users = users;
        this.credentials = credentials;
        this.tokens = tokens;
        this.sessions = sessions;
        this.passwordEncoder = passwordEncoder;
        this.tokenGenerator = tokenGenerator;
        this.emailSender = emailSender;
        this.clock = clock;
    }

    @Transactional
    public void resendVerification(String email) {
        AuthUser user = findUser(email);
        if (user == null || user.status() != UserStatus.PENDING) return;
        Instant now = Instant.now(clock);
        if (tokens.hasRecentlyIssuedActiveToken(user.id(), EMAIL_VERIFICATION,
                now.minus(REQUEST_COOLDOWN), now)) return;
        tokens.invalidateActiveTokens(user.id(), EMAIL_VERIFICATION, now);
        String rawToken = tokenGenerator.generate();
        Instant expiresAt = now.plus(EMAIL_TOKEN_TTL);
        tokens.insertEmailVerificationToken(user.id(), tokenGenerator.hash(rawToken), now, expiresAt);
        try {
            emailSender.send(user.email(), rawToken, expiresAt);
        } catch (VerificationEmailDeliveryException exception) {
            tokens.invalidateActiveTokens(user.id(), EMAIL_VERIFICATION, now);
            log.warn("Verification email resend failed; response remains generic");
        }
    }

    @Transactional
    public void forgotPassword(String email) {
        AuthUser user = findUser(email);
        if (user == null || user.status() != UserStatus.ACTIVE) return;
        Instant now = Instant.now(clock);
        if (tokens.hasRecentlyIssuedActiveToken(user.id(), PASSWORD_RESET,
                now.minus(REQUEST_COOLDOWN), now)) return;
        tokens.invalidateActiveTokens(user.id(), PASSWORD_RESET, now);
        String rawToken = tokenGenerator.generate();
        Instant expiresAt = now.plus(PASSWORD_RESET_TTL);
        tokens.insertPasswordResetToken(user.id(), tokenGenerator.hash(rawToken), now, expiresAt);
        try {
            emailSender.sendPasswordReset(user.email(), rawToken, expiresAt);
        } catch (VerificationEmailDeliveryException exception) {
            tokens.invalidateActiveTokens(user.id(), PASSWORD_RESET, now);
            log.warn("Password reset email delivery failed; response remains generic");
        }
    }

    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        Instant now = Instant.now(clock);
        OneTimeTokenRepository.OneTimeToken token = tokens
                .findActivePasswordResetToken(tokenGenerator.hash(rawToken), now)
                .orElseThrow(InvalidPasswordResetTokenException::new);
        AuthUser user = users.findById(token.userId())
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(InvalidPasswordResetTokenException::new);
        PasswordCredentialRepository.PasswordCredential current = credentials.findByUserId(user.id())
                .orElseThrow(InvalidPasswordResetTokenException::new);
        rejectReusedPassword(newPassword, current);
        if (!tokens.consume(token.id(), now)) throw new InvalidPasswordResetTokenException();
        if (!credentials.updatePassword(user.id(), passwordEncoder.encode(newPassword), now)) {
            throw new InvalidPasswordResetTokenException();
        }
        sessions.revokeAllByUserId(user.id(), "PASSWORD_RESET", now);
    }

    @Transactional
    public void changePassword(UUID publicUserId, String currentPassword, String newPassword) {
        Instant now = Instant.now(clock);
        AuthUser user = users.findByPublicId(publicUserId)
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(CurrentUserUnavailableException::new);
        PasswordCredentialRepository.PasswordCredential current = credentials.findByUserId(user.id())
                .orElseThrow(InvalidCredentialsException::new);
        if (!passwordEncoder.matches(currentPassword, current.passwordHash())) {
            throw new InvalidCredentialsException();
        }
        rejectReusedPassword(newPassword, current);
        if (!credentials.updatePassword(user.id(), passwordEncoder.encode(newPassword), now)) {
            throw new CurrentUserUnavailableException();
        }
        sessions.revokeAllByUserId(user.id(), "PASSWORD_CHANGED", now);
    }

    private AuthUser findUser(String email) {
        if (email == null || email.isBlank()) return null;
        return users.findByNormalizedEmail(email.trim().toLowerCase(Locale.ROOT)).orElse(null);
    }

    private void rejectReusedPassword(String newPassword,
                                      PasswordCredentialRepository.PasswordCredential current) {
        if (passwordEncoder.matches(newPassword, current.passwordHash())) {
            throw new PasswordPolicyException("New password must be different from the current password");
        }
    }
}
