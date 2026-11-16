package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.RefreshTokenRepository;
import com.smartrecruitment.auth.user.application.port.SessionRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
@Transactional
class AuthUserRepositoryTests {

    @Autowired
    private AuthUserRepository repository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Test
    void insertsAndFindsUserByNormalizedEmail() {
        assertThat(repository.existsByNormalizedEmail("candidate@example.com")).isFalse();

        AuthUser saved = repository.insert(AuthUser.pending("Candidate@Example.com"));

        assertThat(repository.findByNormalizedEmail("candidate@example.com"))
                .contains(saved);
        assertThat(saved.id()).isPositive();
        assertThat(repository.findById(saved.id())).contains(saved);
        assertThat(saved.status()).isEqualTo(UserStatus.PENDING);
        assertThat(repository.existsByNormalizedEmail("candidate@example.com")).isTrue();
    }

    @Test
    void rejectsDuplicateNormalizedEmail() {
        repository.insert(AuthUser.pending("candidate@example.com"));

        assertThatThrownBy(() ->
                repository.insert(AuthUser.pending("CANDIDATE@example.com")))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void rejectsInconsistentNormalizedEmail() {
        Instant now = Instant.parse("2026-07-22T00:00:00Z");

        assertThatThrownBy(() -> new AuthUser(
                null,
                "Candidate@Example.com",
                "other@example.com",
                UserStatus.PENDING,
                null,
                null,
                now,
                now,
                0
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("normalizedEmail");
    }

    @Test
    void guardsTimestampChecksUnderWallClockRollback() {
        Instant created = Instant.parse("2026-11-16T04:00:05Z");
        Instant earlier = created.minusSeconds(5).truncatedTo(ChronoUnit.MICROS);
        AuthUser pending = repository.insert(new AuthUser(
                null,
                "clock.skew@example.com",
                "clock.skew@example.com",
                UserStatus.PENDING,
                null,
                null,
                created,
                created,
                0
        ));

        AuthUser activated = repository.activateById(pending.id(), earlier).orElseThrow();
        assertThat(activated.status()).isEqualTo(UserStatus.ACTIVE);
        assertThat(activated.updatedAt()).isAfterOrEqualTo(created);

        AuthUser loggedIn = repository.updateLastLogin(pending.id(), earlier).orElseThrow();
        assertThat(loggedIn.updatedAt()).isAfterOrEqualTo(created);

        SessionRepository.Session session = sessionRepository.insert(
                pending.id(), "WEB", "Chrome", "Agent", "127.0.0.1",
                created, created.plusSeconds(3600), created.plusSeconds(86400)
        );
        RefreshTokenRepository.RefreshToken initial = refreshTokenRepository.insert(
                session.id(), "a".repeat(64), null, created, created.plusSeconds(86400)
        );
        RefreshTokenRepository.RefreshToken rotated = refreshTokenRepository.insert(
                session.id(), "b".repeat(64), initial.id(), created, created.plusSeconds(86400)
        );
        assertThat(refreshTokenRepository.markUsedAndReplaced(initial.id(), earlier, rotated.id())).isTrue();
        assertThat(sessionRepository.touch(session.id(), "127.0.0.2", earlier, created.plusSeconds(7200))).isTrue();
        assertThat(sessionRepository.revoke(session.id(), "LOGOUT", earlier)).isTrue();
    }
}
