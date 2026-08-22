package com.smartrecruitment.core.recruiter.domain;

import java.util.Objects;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

public record Company(UUID publicId, String legalName, String displayName, String slug,
                      String description, String websiteUrl, String countryCode,
                      String registrationNumber, String sizeRange, CompanyStatus status,
                      CompanyVerificationStatus verificationStatus, UUID createdByUserId,
                      long version) {
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");

    public Company {
        Objects.requireNonNull(publicId, "publicId");
        legalName = required(legalName, "legalName", 240);
        displayName = required(displayName, "displayName", 240);
        slug = required(slug, "slug", 160).toLowerCase(Locale.ROOT);
        if (!SLUG.matcher(slug).matches()) throw new IllegalArgumentException("slug has invalid format");
        description = optional(description, "description", 10000);
        websiteUrl = optional(websiteUrl, "websiteUrl", 500);
        countryCode = required(countryCode, "countryCode", 2).toUpperCase();
        if (!countryCode.matches("^[A-Z]{2}$")) throw new IllegalArgumentException("countryCode has invalid format");
        registrationNumber = optional(registrationNumber, "registrationNumber", 80);
        sizeRange = optional(sizeRange, "sizeRange", 30);
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(verificationStatus, "verificationStatus");
        Objects.requireNonNull(createdByUserId, "createdByUserId");
        if (version < 0) throw new IllegalArgumentException("version must not be negative");
    }

    public static Company create(UUID createdByUserId, String legalName, String displayName, String slug,
                                 String description, String websiteUrl, String countryCode,
                                 String registrationNumber, String sizeRange) {
        return new Company(UUID.randomUUID(), legalName, displayName, slug, description, websiteUrl,
                countryCode, registrationNumber, sizeRange, CompanyStatus.PENDING,
                CompanyVerificationStatus.UNVERIFIED, createdByUserId, 0);
    }

    public Company update(String legalName, String displayName, String slug, String description,
                          String websiteUrl, String countryCode, String registrationNumber, String sizeRange) {
        return new Company(publicId, legalName, displayName, slug, description, websiteUrl, countryCode,
                registrationNumber, sizeRange, status, verificationStatus, createdByUserId, version);
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
