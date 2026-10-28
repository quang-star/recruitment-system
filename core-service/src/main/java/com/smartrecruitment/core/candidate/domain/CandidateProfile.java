package com.smartrecruitment.core.candidate.domain;

import java.util.Objects;

public record CandidateProfile(Long id, Long userId, String displayName, String headline,
                               String locationText, ProfileVisibility visibility, long version,
                               String phoneNumber, String contactEmail, String linkedinUrl,
                               String githubUrl, String portfolioUrl, String avatarUrl, String bio) {
    public CandidateProfile {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(userId, "userId");
        displayName = requireText(displayName, "displayName", 120);
        headline = optionalText(headline, "headline", 200);
        locationText = optionalText(locationText, "locationText", 160);
        phoneNumber = optionalText(phoneNumber, "phoneNumber", 30);
        contactEmail = optionalText(contactEmail, "contactEmail", 255);
        linkedinUrl = optionalText(linkedinUrl, "linkedinUrl", 300);
        githubUrl = optionalText(githubUrl, "githubUrl", 300);
        portfolioUrl = optionalText(portfolioUrl, "portfolioUrl", 300);
        avatarUrl = optionalText(avatarUrl, "avatarUrl", 500);
        bio = optionalText(bio, "bio", 2000);
        Objects.requireNonNull(visibility, "visibility");
        if (version < 0) throw new IllegalArgumentException("version must not be negative");
    }

    public static CandidateProfile create(Long userId, String displayName, String headline, String locationText,
                                          ProfileVisibility visibility) {
        return new CandidateProfile(0L, userId, displayName, headline, locationText,
                visibility, 0, null, null, null, null, null, null, null);
    }

    public static CandidateProfile create(Long userId, String displayName, String headline, String locationText,
                                          ProfileVisibility visibility, String phoneNumber, String contactEmail,
                                          String linkedinUrl, String githubUrl, String portfolioUrl,
                                          String avatarUrl, String bio) {
        return new CandidateProfile(0L, userId, displayName, headline, locationText,
                visibility, 0, phoneNumber, contactEmail, linkedinUrl, githubUrl, portfolioUrl, avatarUrl, bio);
    }

    public CandidateProfile update(String displayName, String headline, String locationText,
                                   ProfileVisibility visibility) {
        return new CandidateProfile(id, userId, displayName, headline, locationText, visibility, version,
                phoneNumber, contactEmail, linkedinUrl, githubUrl, portfolioUrl, avatarUrl, bio);
    }

    public CandidateProfile update(String displayName, String headline, String locationText,
                                   ProfileVisibility visibility, String phoneNumber, String contactEmail,
                                   String linkedinUrl, String githubUrl, String portfolioUrl,
                                   String avatarUrl, String bio) {
        return new CandidateProfile(id, userId, displayName, headline, locationText, visibility, version,
                phoneNumber, contactEmail, linkedinUrl, githubUrl, portfolioUrl, avatarUrl, bio);
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
