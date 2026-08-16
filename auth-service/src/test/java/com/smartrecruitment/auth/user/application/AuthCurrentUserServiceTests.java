package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuthCurrentUserServiceTests {
    private static final UUID USER_ID = UUID.fromString("b605d1b4-f751-46c4-8b33-bb5e921fc701");

    @Test
    void returnsActiveUserWithCurrentRoles() {
        AuthUser user = user(UserStatus.ACTIVE, Instant.parse("2026-08-14T00:00:00Z"));
        AuthCurrentUserService service = new AuthCurrentUserService(repository(user),
                internalUserId -> List.of("CANDIDATE"));

        CurrentUserResult result = service.get(USER_ID);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.email()).isEqualTo("candidate@example.com");
        assertThat(result.emailVerified()).isTrue();
        assertThat(result.roles()).containsExactly("CANDIDATE");
    }

    @Test
    void rejectsUserThatIsNoLongerActive() {
        AuthCurrentUserService service = new AuthCurrentUserService(repository(user(UserStatus.SUSPENDED, null)),
                internalUserId -> List.of("CANDIDATE"));

        assertThatThrownBy(() -> service.get(USER_ID))
                .isInstanceOf(CurrentUserUnavailableException.class);
    }

    private static AuthUserRepository repository(AuthUser user) {
        return new AuthUserRepository() {
            @Override
            public AuthUser insert(AuthUser value) {
                throw new UnsupportedOperationException();
            }

            @Override
            public Optional<AuthUser> findByNormalizedEmail(String normalizedEmail) {
                return Optional.empty();
            }

            @Override
            public Optional<AuthUser> findByPublicId(UUID publicId) {
                return USER_ID.equals(publicId) ? Optional.of(user) : Optional.empty();
            }

            @Override
            public boolean existsByNormalizedEmail(String normalizedEmail) {
                return false;
            }

            @Override
            public Optional<AuthUser> activateById(Long id, Instant verifiedAt) {
                return Optional.empty();
            }
        };
    }

    private static AuthUser user(UserStatus status, Instant verifiedAt) {
        Instant createdAt = Instant.parse("2026-08-01T00:00:00Z");
        return new AuthUser(1L, USER_ID, "candidate@example.com", "candidate@example.com",
                status, verifiedAt, null, createdAt, createdAt, 0);
    }
}
