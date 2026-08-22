package com.smartrecruitment.core.recruiter.domain;

import java.util.Objects;
import java.util.UUID;

public record RecruiterProfile(UUID publicId, UUID userId, String displayName,
                               String businessTitle, String businessPhone, long version) {
    public RecruiterProfile {
        Objects.requireNonNull(publicId, "publicId");
        Objects.requireNonNull(userId, "userId");
        displayName = required(displayName, "displayName", 160);
        businessTitle = optional(businessTitle, "businessTitle", 160);
        businessPhone = optional(businessPhone, "businessPhone", 32);
        if (version < 0) throw new IllegalArgumentException("version must not be negative");
    }

    public static RecruiterProfile create(UUID userId, String displayName,
                                           String businessTitle, String businessPhone) {
        return new RecruiterProfile(UUID.randomUUID(), userId, displayName, businessTitle, businessPhone, 0);
    }

    public RecruiterProfile update(String displayName, String businessTitle, String businessPhone) {
        return new RecruiterProfile(publicId, userId, displayName, businessTitle, businessPhone, version);
    }

    private static String required(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " must not be blank");
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException(field + " is too long");
        return normalized;
    }

    private static String optional(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException(field + " is too long");
        return normalized;
    }
}
