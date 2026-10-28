package com.smartrecruitment.auth.user.domain;

import java.time.Instant;
import java.util.Locale;
import java.util.Objects;

public record AuthUser(
        Long id,
        String email,
        String normalizedEmail,
        UserStatus status,
        Instant emailVerifiedAt,
        Instant lastLoginAt,
        Instant createdAt,
        Instant updatedAt,
        long version
) {

    public AuthUser {
        if (id != null && id <= 0) {
            throw new IllegalArgumentException("id must be positive when present");
        }
        String canonicalEmail = Objects.requireNonNull(email, "email is required").trim();
        if (canonicalEmail.isEmpty()) {
            throw new IllegalArgumentException("email must not be blank");
        }

        String expectedNormalizedEmail = canonicalEmail.toLowerCase(Locale.ROOT);
        if (!Objects.requireNonNull(normalizedEmail, "normalizedEmail is required")
                .equals(expectedNormalizedEmail)) {
            throw new IllegalArgumentException("normalizedEmail must match the canonical email");
        }

        Objects.requireNonNull(status, "status is required");
        Objects.requireNonNull(createdAt, "createdAt is required");
        Objects.requireNonNull(updatedAt, "updatedAt is required");
        if (version < 0) {
            throw new IllegalArgumentException("version must not be negative");
        }

        email = canonicalEmail;
    }

    public static AuthUser verified(String email, Instant now) {
        String canonicalEmail = Objects.requireNonNull(email, "email is required").trim();
        return new AuthUser(null, canonicalEmail, canonicalEmail.toLowerCase(Locale.ROOT),
                UserStatus.ACTIVE, now, null, now, now, 0);
    }

    public static AuthUser pending(String email) {
        String canonicalEmail = Objects.requireNonNull(email, "email is required").trim();
        Instant now = Instant.now();

        return new AuthUser(
                null,
                canonicalEmail,
                canonicalEmail.toLowerCase(Locale.ROOT),
                UserStatus.PENDING,
                null,
                null,
                now,
                now,
                0
        );
    }
}
