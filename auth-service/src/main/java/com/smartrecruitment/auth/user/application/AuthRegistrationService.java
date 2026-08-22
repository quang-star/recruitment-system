package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.OneTimeTokenRepository;
import com.smartrecruitment.auth.user.application.port.PasswordCredentialRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.application.port.VerificationEmailSender;
import com.smartrecruitment.auth.user.application.port.VerificationTokenGenerator;
import com.smartrecruitment.auth.user.domain.AuthUser;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

@Service
public class AuthRegistrationService {
    private static final Duration EMAIL_VERIFICATION_TTL = Duration.ofMinutes(15);
    private final AuthUserRepository users;
    private final PasswordCredentialRepository credentials;
    private final OneTimeTokenRepository tokens;
    private final RoleRepository roles;
    private final PasswordEncoder passwordEncoder;
    private final VerificationTokenGenerator tokenGenerator;
    private final VerificationEmailSender verificationEmailSender;

    @Autowired
    public AuthRegistrationService(AuthUserRepository users, PasswordCredentialRepository credentials,
                                   OneTimeTokenRepository tokens, RoleRepository roles,
                                   PasswordEncoder passwordEncoder, VerificationTokenGenerator tokenGenerator,
                                   VerificationEmailSender verificationEmailSender) {
        this.users = users;
        this.credentials = credentials;
        this.tokens = tokens;
        this.roles = roles;
        this.passwordEncoder = passwordEncoder;
        this.tokenGenerator = tokenGenerator;
        this.verificationEmailSender = verificationEmailSender;
    }

    @Transactional
    public RegistrationResult register(String email, String password) {
        return register(email, password, "CANDIDATE");
    }

    @Transactional
    public RegistrationResult register(String email, String password, String accountType) {
        String roleCode = accountType == null || accountType.isBlank()
                ? "CANDIDATE" : accountType.trim().toUpperCase(Locale.ROOT);
        if (!roleCode.equals("CANDIDATE") && !roleCode.equals("RECRUITER")) {
            throw new IllegalArgumentException("accountType must be CANDIDATE or RECRUITER");
        }
        AuthUser pendingUser = AuthUser.pending(email);
        if (users.existsByNormalizedEmail(pendingUser.normalizedEmail())) throw new EmailAlreadyRegisteredException();
        AuthUser savedUser = users.insert(pendingUser);
        Instant now = Instant.now();
        credentials.insert(savedUser.id(), passwordEncoder.encode(password), now);
        if (roleCode.equals("RECRUITER")) roles.assignRecruiterRole(savedUser.id(), now);
        else roles.assignCandidateRole(savedUser.id(), now);
        String rawToken = tokenGenerator.generate();
        Instant expiresAt = now.plus(EMAIL_VERIFICATION_TTL);
        tokens.insertEmailVerificationToken(savedUser.id(), tokenGenerator.hash(rawToken), now, expiresAt);
        verificationEmailSender.send(savedUser.email(), rawToken, expiresAt);
        return RegistrationResult.from(savedUser);
    }

    @Transactional
    public EmailVerificationResult verifyEmail(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) throw new InvalidEmailVerificationTokenException();
        Instant now = Instant.now();
        OneTimeTokenRepository.OneTimeToken token = tokens.findActiveEmailVerificationToken(tokenGenerator.hash(rawToken), now)
                .orElseThrow(InvalidEmailVerificationTokenException::new);
        if (!tokens.consume(token.id(), now)) throw new InvalidEmailVerificationTokenException();
        return users.activateById(token.userId(), now).map(EmailVerificationResult::from)
                .orElseThrow(InvalidEmailVerificationTokenException::new);
    }
}
