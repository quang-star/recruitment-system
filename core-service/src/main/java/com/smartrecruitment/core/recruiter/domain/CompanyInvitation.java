package com.smartrecruitment.core.recruiter.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

public record CompanyInvitation(UUID publicId, UUID companyId, String email, String normalizedEmail,
                                String role, String tokenHash, UUID invitedByUserId,
                                OffsetDateTime expiresAt, UUID acceptedByUserId,
                                OffsetDateTime acceptedAt, OffsetDateTime revokedAt,
                                OffsetDateTime createdAt, long version) {
    private static final Set<String> INVITABLE_ROLES = Set.of("COMPANY_ADMIN", "RECRUITER", "VIEWER");

    public CompanyInvitation {
        Objects.requireNonNull(publicId, "publicId");
        Objects.requireNonNull(companyId, "companyId");
        Objects.requireNonNull(email, "email");
        Objects.requireNonNull(normalizedEmail, "normalizedEmail");
        Objects.requireNonNull(tokenHash, "tokenHash");
        Objects.requireNonNull(invitedByUserId, "invitedByUserId");
        Objects.requireNonNull(expiresAt, "expiresAt");
        Objects.requireNonNull(createdAt, "createdAt");
        if (!INVITABLE_ROLES.contains(role)) throw new IllegalArgumentException("Invalid invitation role");
        if (tokenHash.length() != 64) throw new IllegalArgumentException("Invalid invitation token hash");
        if ((acceptedByUserId == null) != (acceptedAt == null)) {
            throw new IllegalArgumentException("Invitation acceptance fields must be set together");
        }
        if (acceptedAt != null && revokedAt != null) {
            throw new IllegalArgumentException("Accepted invitation cannot also be revoked");
        }
        if (version < 0) throw new IllegalArgumentException("Invitation version must not be negative");
    }

    public static CompanyInvitation create(UUID companyId, String email, String normalizedEmail, String role,
                                           String tokenHash, UUID invitedByUserId,
                                           OffsetDateTime createdAt, OffsetDateTime expiresAt) {
        return new CompanyInvitation(UUID.randomUUID(), companyId, email, normalizedEmail, role, tokenHash,
                invitedByUserId, expiresAt, null, null, null, createdAt, 0);
    }

    public boolean activeAt(OffsetDateTime now) {
        return acceptedAt == null && revokedAt == null && expiresAt.isAfter(now);
    }
}

