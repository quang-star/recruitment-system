package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;

import java.util.UUID;

public record CompanyResponse(UUID companyId, String legalName, String displayName, String slug,
                              String description, String websiteUrl, String countryCode,
                              String registrationNumber, String sizeRange, CompanyStatus status,
                              CompanyVerificationStatus verificationStatus, UUID createdByUserId,
                              long version) {
    public static CompanyResponse from(Company company) {
        return new CompanyResponse(company.publicId(), company.legalName(), company.displayName(), company.slug(),
                company.description(), company.websiteUrl(), company.countryCode(), company.registrationNumber(),
                company.sizeRange(), company.status(), company.verificationStatus(), company.createdByUserId(),
                company.version());
    }
}
