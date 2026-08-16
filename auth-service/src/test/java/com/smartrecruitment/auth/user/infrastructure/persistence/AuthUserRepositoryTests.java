package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
@Transactional
class AuthUserRepositoryTests {

    @Autowired
    private AuthUserRepository repository;

    @Test
    void insertsAndFindsUserByNormalizedEmail() {
        assertThat(repository.existsByNormalizedEmail("candidate@example.com")).isFalse();

        AuthUser saved = repository.insert(AuthUser.pending("Candidate@Example.com"));

        assertThat(repository.findByNormalizedEmail("candidate@example.com"))
                .contains(saved);
        assertThat(saved.id()).isPositive();
        assertThat(saved.publicId()).isNotNull();
        assertThat(repository.findByPublicId(saved.publicId())).contains(saved);
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
                UUID.randomUUID(),
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
}