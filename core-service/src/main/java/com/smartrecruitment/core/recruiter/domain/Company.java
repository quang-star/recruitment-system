package com.smartrecruitment.core.recruiter.domain;

import java.util.Objects;
import java.util.Locale;
import java.util.regex.Pattern;

public record Company(Long id, String legalName, String displayName, String slug,
                      String description, String websiteUrl, String countryCode,
                      String registrationNumber, String sizeRange, String logoUrl, String coverImageUrl,
                      CompanyStatus status, CompanyVerificationStatus verificationStatus,
                      Long createdByUserId, long version) {
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");

    public Company {
        Objects.requireNonNull(id, "id");
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
        logoUrl = optional(logoUrl, "logoUrl", 1000);
        coverImageUrl = optional(coverImageUrl, "coverImageUrl", 1000);
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(verificationStatus, "verificationStatus");
        Objects.requireNonNull(createdByUserId, "createdByUserId");
        if (version < 0) throw new IllegalArgumentException("version must not be negative");
    }

    public static Company create(Long createdByUserId, String legalName, String displayName, String slug,
                                 String description, String websiteUrl, String countryCode,
                                 String registrationNumber, String sizeRange, String logoUrl, String coverImageUrl) {
        return new Company(0L, legalName, displayName, slug, description, websiteUrl,
                countryCode, registrationNumber, sizeRange, logoUrl, coverImageUrl, CompanyStatus.PENDING,
                CompanyVerificationStatus.UNVERIFIED, createdByUserId, 0);
    }

    public static Company create(Long createdByUserId, String legalName, String displayName, String slug,
                                 String description, String websiteUrl, String countryCode,
                                 String registrationNumber, String sizeRange) {
        return create(createdByUserId, legalName, displayName, slug, description, websiteUrl,
                countryCode, registrationNumber, sizeRange, null, null);
    }

    public Company update(String legalName, String displayName, String slug, String description,
                          String websiteUrl, String countryCode, String registrationNumber, String sizeRange,
                          String logoUrl, String coverImageUrl) {
        return new Company(id, legalName, displayName, slug, description, websiteUrl, countryCode,
                registrationNumber, sizeRange, logoUrl, coverImageUrl, status, verificationStatus, createdByUserId, version);
    }

    public Company update(String legalName, String displayName, String slug, String description,
                          String websiteUrl, String countryCode, String registrationNumber, String sizeRange) {
        return update(legalName, displayName, slug, description, websiteUrl, countryCode,
                registrationNumber, sizeRange, this.logoUrl, this.coverImageUrl);
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
