package com.smartrecruitment.core.recruiter.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

public record CompanyMember(UUID publicId, UUID companyId, UUID userId, String role, String status,
                            OffsetDateTime joinedAt, long version) {
    public CompanyMember {
        Objects.requireNonNull(publicId, "publicId");
        Objects.requireNonNull(companyId, "companyId");
        Objects.requireNonNull(userId, "userId");
        if (!java.util.Set.of("OWNER", "COMPANY_ADMIN", "RECRUITER", "VIEWER").contains(role)) {
            throw new IllegalArgumentException("Invalid company member role");
        }
        if (!java.util.Set.of("ACTIVE", "SUSPENDED", "LEFT").contains(status)) {
            throw new IllegalArgumentException("Invalid company member status");
        }
        Objects.requireNonNull(joinedAt, "joinedAt");
        if (version < 0) throw new IllegalArgumentException("Member version must not be negative");
    }
}

