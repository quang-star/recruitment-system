package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.Optional;

public interface PasswordCredentialRepository {
    void insert(Long userId, String passwordHash, Instant createdAt);
    default Optional<PasswordCredential> findByUserId(Long userId) { return Optional.empty(); }
    record PasswordCredential(String passwordHash, Instant lockedUntil, boolean mustChangePassword) {}
}
