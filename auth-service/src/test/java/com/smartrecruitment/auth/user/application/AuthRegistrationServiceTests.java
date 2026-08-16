package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.OneTimeTokenRepository;
import com.smartrecruitment.auth.user.application.port.VerificationTokenGenerator;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthRegistrationServiceTests {

    private static final String RAW_TOKEN = "verification-token";

    @Test
    void registersPendingUserWithHashedPasswordAndVerificationToken() {
        TestRepositories repositories = new TestRepositories();
        AuthRegistrationService service = repositories.service();

        RegistrationResult result = service.register("Candidate@Example.com", "correct horse battery");

        assertThat(result.email()).isEqualTo("Candidate@Example.com");
        assertThat(result.status()).isEqualTo("PENDING");
        assertThat(result.verificationRequired()).isTrue();
        assertThat(repositories.passwordHash).isNotEqualTo("correct horse battery");
        assertThat(repositories.passwordEncoder.matches("correct horse battery", repositories.passwordHash)).isTrue();
        assertThat(repositories.tokenHash).isEqualTo("hash:" + RAW_TOKEN);
        assertThat(repositories.user.normalizedEmail()).isEqualTo("candidate@example.com");
        assertThat(repositories.emailRecipient).isEqualTo("Candidate@Example.com");
        assertThat(repositories.emailedToken).isEqualTo(RAW_TOKEN);
        assertThat(repositories.emailExpiresAt).isAfter(Instant.now());
    }

    @Test
    void verifiesTokenOnceAndActivatesUser() {
        TestRepositories repositories = new TestRepositories();
        AuthRegistrationService service = repositories.service();

        service.register("candidate@example.com", "correct horse battery");
        EmailVerificationResult result = service.verifyEmail(RAW_TOKEN);

        assertThat(result.status()).isEqualTo("ACTIVE");
        assertThat(repositories.consumed).isTrue();
        assertThat(repositories.user.status()).isEqualTo(UserStatus.ACTIVE);
        assertThatThrownBy(() -> service.verifyEmail(RAW_TOKEN))
                .isInstanceOf(InvalidEmailVerificationTokenException.class);
    }

    @Test
    void rejectsDuplicateEmailBeforeWritingCredentials() {
        TestRepositories repositories = new TestRepositories();
        AuthRegistrationService service = repositories.service();
        service.register("candidate@example.com", "correct horse battery");

        assertThatThrownBy(() -> service.register("CANDIDATE@example.com", "another password"))
                .isInstanceOf(EmailAlreadyRegisteredException.class);
        assertThat(repositories.passwordInsertCount).isEqualTo(1);
    }

    private static final class TestRepositories {
        private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);
        private final VerificationTokenGenerator tokenGenerator = new VerificationTokenGenerator() {
            @Override
            public String generate() {
                return RAW_TOKEN;
            }

            @Override
            public String hash(String rawToken) {
                return "hash:" + rawToken;
            }
        };
        private AuthUser user;
        private String passwordHash;
        private String tokenHash;
        private boolean consumed;
        private int passwordInsertCount;
        private String emailRecipient;
        private String emailedToken;
        private Instant emailExpiresAt;

        private AuthRegistrationService service() {
            return new AuthRegistrationService(
                    new AuthUserRepository() {
                        @Override
                        public AuthUser insert(AuthUser pending) {
                            user = new AuthUser(
                                    1L,
                                    pending.publicId(),
                                    pending.email(),
                                    pending.normalizedEmail(),
                                    pending.status(),
                                    pending.emailVerifiedAt(),
                                    pending.lastLoginAt(),
                                    pending.createdAt(),
                                    pending.updatedAt(),
                                    pending.version()
                            );
                            return user;
                        }

                        @Override
                        public Optional<AuthUser> findByNormalizedEmail(String normalizedEmail) {
                            return Optional.ofNullable(user)
                                    .filter(value -> value.normalizedEmail().equals(normalizedEmail));
                        }

                        @Override
                        public Optional<AuthUser> findByPublicId(UUID publicId) {
                            return Optional.ofNullable(user)
                                    .filter(value -> value.publicId().equals(publicId));
                        }

                        @Override
                        public boolean existsByNormalizedEmail(String normalizedEmail) {
                            return findByNormalizedEmail(normalizedEmail).isPresent();
                        }

                        @Override
                        public Optional<AuthUser> activateById(Long id, Instant verifiedAt) {
                            if (user == null || !user.id().equals(id) || user.status() != UserStatus.PENDING) {
                                return Optional.empty();
                            }
                            user = new AuthUser(
                                    user.id(),
                                    user.publicId(),
                                    user.email(),
                                    user.normalizedEmail(),
                                    UserStatus.ACTIVE,
                                    verifiedAt,
                                    user.lastLoginAt(),
                                    user.createdAt(),
                                    verifiedAt,
                                    user.version() + 1
                            );
                            return Optional.of(user);
                        }
                    },
                    (userId, hash, createdAt) -> {
                        passwordHash = hash;
                        passwordInsertCount++;
                    },
                    new OneTimeTokenRepository() {
                        @Override
                        public void insertEmailVerificationToken(Long userId, String hash, Instant createdAt, Instant expiresAt) {
                            tokenHash = hash;
                        }

                        @Override
                        public Optional<OneTimeToken> findActiveEmailVerificationToken(String hash, Instant now) {
                            if (consumed || !("hash:" + RAW_TOKEN).equals(hash) || user == null) {
                                return Optional.empty();
                            }
                            return Optional.of(new OneTimeToken(1L, user.id(), now.plusSeconds(60)));
                        }

                        @Override
                        public boolean consume(Long id, Instant consumedAt) {
                            consumed = true;
                            return true;
                        }
                    },
                    userId -> List.of("CANDIDATE"),
                    passwordEncoder,
                    tokenGenerator,
                    (recipient, rawToken, expiresAt) -> {
                        emailRecipient = recipient;
                        emailedToken = rawToken;
                        emailExpiresAt = expiresAt;
                    }
            );
        }
    }
}
