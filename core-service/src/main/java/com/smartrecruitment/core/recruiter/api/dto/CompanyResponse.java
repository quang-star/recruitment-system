package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;


public record CompanyResponse(Long companyId, String legalName, String displayName, String slug,
                              String description, String websiteUrl, String countryCode,
                              String registrationNumber, String sizeRange, String logoUrl, String coverImageUrl,
                              CompanyStatus status, CompanyVerificationStatus verificationStatus,
                              Long createdByUserId, long version) {
    public CompanyResponse(Long companyId, String legalName, String displayName, String slug,
                           String description, String websiteUrl, String countryCode,
                           String registrationNumber, String sizeRange, CompanyStatus status,
                           CompanyVerificationStatus verificationStatus, Long createdByUserId,
                           long version) {
        this(companyId, legalName, displayName, slug, description, websiteUrl, countryCode,
                registrationNumber, sizeRange, null, null, status, verificationStatus, createdByUserId, version);
    }

    public static CompanyResponse from(Company company) {
        return new CompanyResponse(company.id(), company.legalName(), company.displayName(), company.slug(),
                company.description(), company.websiteUrl(), company.countryCode(), company.registrationNumber(),
                company.sizeRange(), company.logoUrl(), company.coverImageUrl(), company.status(),
                company.verificationStatus(), company.createdByUserId(), company.version());
    }
}
