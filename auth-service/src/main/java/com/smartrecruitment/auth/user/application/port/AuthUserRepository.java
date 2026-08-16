package com.smartrecruitment.auth.user.application.port;
import com.smartrecruitment.auth.user.domain.AuthUser;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
public interface AuthUserRepository {
    AuthUser insert(AuthUser user);
    Optional<AuthUser> findByNormalizedEmail(String normalizedEmail);
    Optional<AuthUser> findByPublicId(UUID publicId);
    default Optional<AuthUser> findById(Long id) { return Optional.empty(); }
    boolean existsByNormalizedEmail(String normalizedEmail);
    Optional<AuthUser> activateById(Long id, Instant verifiedAt);
    default Optional<AuthUser> updateLastLogin(Long id, Instant lastLoginAt) { return findById(id); }
}
