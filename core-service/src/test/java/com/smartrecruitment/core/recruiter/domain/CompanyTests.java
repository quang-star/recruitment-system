package com.smartrecruitment.core.recruiter.domain;

import org.junit.jupiter.api.Test;


import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyTests {
    @Test
    void createsPendingUnverifiedCompany() {
        Long owner = com.smartrecruitment.core.support.TestIds.next();

        Company company = Company.create(owner, "Acme Legal", "Acme", "acme-vn",
                "Software company", "https://acme.example", "vn", null, "11-50");

        assertThat(company.slug()).isEqualTo("acme-vn");
        assertThat(company.countryCode()).isEqualTo("VN");
        assertThat(company.status()).isEqualTo(CompanyStatus.PENDING);
        assertThat(company.verificationStatus()).isEqualTo(CompanyVerificationStatus.UNVERIFIED);
        assertThat(company.createdByUserId()).isEqualTo(owner);
    }

    @Test
    void createsCompanyWithBrandingMedia() {
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        Company company = Company.create(owner, "Acme Legal", "Acme", "acme-vn",
                "Software company", "https://acme.example", "vn", null, "11-50",
                "https://cdn.example.com/logo.png", "https://cdn.example.com/cover.jpg");

        assertThat(company.logoUrl()).isEqualTo("https://cdn.example.com/logo.png");
        assertThat(company.coverImageUrl()).isEqualTo("https://cdn.example.com/cover.jpg");

        Company updated = company.update("Acme New Legal", "Acme New", "acme-vn", "Desc",
                "https://acme.example", "VN", null, "51-200",
                "https://cdn.example.com/new-logo.png", "https://cdn.example.com/new-cover.jpg");

        assertThat(updated.logoUrl()).isEqualTo("https://cdn.example.com/new-logo.png");
        assertThat(updated.coverImageUrl()).isEqualTo("https://cdn.example.com/new-cover.jpg");
    }
}
