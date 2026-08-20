package com.smartrecruitment.core.candidate.domain;

import java.util.Objects;
import java.util.UUID;

public record CandidateProfile(UUID publicId, UUID userId, String displayName, String headline,
                               String locationText, ProfileVisibility visibility, long version) {
    public CandidateProfile {
        Objects.requireNonNull(publicId, "publicId");
        Objects.requireNonNull(userId, "userId");
        displayName = requireText(displayName, "displayName", 120);
        headline = optionalText(headline, "headline", 200);
        locationText = optionalText(locationText, "locationText", 160);
        Objects.requireNonNull(visibility, "visibility");
        if (version < 0) throw new IllegalArgumentException("version must not be negative");
    }

    public static CandidateProfile create(UUID userId, String displayName, String headline, String locationText,
                                          ProfileVisibility visibility) {
        return new CandidateProfile(UUID.randomUUID(), userId, displayName, headline, locationText,
                visibility, 0);
    }

    public CandidateProfile update(String displayName, String headline, String locationText,
                                   ProfileVisibility visibility) {
        return new CandidateProfile(publicId, userId, displayName, headline, locationText, visibility, version);
    }

    private static String requireText(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " must not be blank");
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException(field + " is too long");
        return normalized;
    }

    private static String optionalText(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException(field + " is too long");
        return normalized;
    }
}
