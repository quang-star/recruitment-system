package com.smartrecruitment.core.recruiter.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateCompanyRequest(
        @NotBlank @Size(max = 240) String legalName,
        @NotBlank @Size(max = 240) String displayName,
        @NotBlank @Size(max = 160) @Pattern(regexp = "^[a-z0-9]+(?:-[a-z0-9]+)*$") String slug,
        @Size(max = 10000) String description,
        @Size(max = 500) String websiteUrl,
        @NotBlank @Pattern(regexp = "^[A-Z]{2}$") String countryCode,
        @Size(max = 80) String registrationNumber,
        @Size(max = 30) String sizeRange,
        @Size(max = 1000) String logoUrl,
        @Size(max = 1000) String coverImageUrl,
        Long version) {
    public CreateCompanyRequest(String legalName, String displayName, String slug, String description,
                                String websiteUrl, String countryCode, String registrationNumber, String sizeRange,
                                Long version) {
        this(legalName, displayName, slug, description, websiteUrl, countryCode, registrationNumber, sizeRange, null, null, version);
    }
}
