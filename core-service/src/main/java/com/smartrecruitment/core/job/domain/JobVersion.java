package com.smartrecruitment.core.job.domain;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.UUID;

public record JobVersion(UUID publicId, int versionNumber, String title, String description,
                         String requirementsText, String benefitsText, String locationText,
                         String countryCode, WorkMode workMode, EmploymentType employmentType,
                         String seniorityLevel, int openings, BigDecimal salaryMin, BigDecimal salaryMax,
                         String salaryCurrency, String salaryPeriod, boolean salaryNegotiable,
                         OffsetDateTime applicationDeadline, String sourceHash, UUID createdByUserId) {
    public JobVersion {
        title = required(title, "title");
        description = required(description, "description");
        requirementsText = required(requirementsText, "requirementsText");
        if (versionNumber < 1) throw new IllegalArgumentException("versionNumber must be positive");
        if (openings < 1) throw new IllegalArgumentException("openings must be positive");
        if (salaryMin != null && salaryMin.signum() < 0) throw new IllegalArgumentException("salaryMin must be non-negative");
        if (salaryMax != null && salaryMax.signum() < 0) throw new IllegalArgumentException("salaryMax must be non-negative");
        if (salaryMin != null && salaryMax != null && salaryMin.compareTo(salaryMax) > 0) {
            throw new IllegalArgumentException("salaryMin must not exceed salaryMax");
        }
        countryCode = normalize(countryCode, 2, "countryCode");
        salaryCurrency = normalize(salaryCurrency, 3, "salaryCurrency");
        sourceHash = required(sourceHash, "sourceHash").toLowerCase(Locale.ROOT);
        if (!sourceHash.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("sourceHash must be a SHA-256 hash");
    }

    private static String required(String value, String field) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " must not be blank");
        return value.trim();
    }

    private static String normalize(String value, int length, String field) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (normalized.length() != length) throw new IllegalArgumentException(field + " must have length " + length);
        return normalized;
    }
}
