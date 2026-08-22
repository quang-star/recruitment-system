package com.smartrecruitment.core.recruiter.domain;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyTests {
    @Test
    void createsPendingUnverifiedCompany() {
        UUID owner = UUID.randomUUID();

        Company company = Company.create(owner, "Acme Legal", "Acme", "acme-vn",
                "Software company", "https://acme.example", "vn", null, "11-50");

        assertThat(company.slug()).isEqualTo("acme-vn");
        assertThat(company.countryCode()).isEqualTo("VN");
        assertThat(company.status()).isEqualTo(CompanyStatus.PENDING);
        assertThat(company.verificationStatus()).isEqualTo(CompanyVerificationStatus.UNVERIFIED);
        assertThat(company.createdByUserId()).isEqualTo(owner);
    }

    @Test
    void rejectsInvalidSlug() {
        assertThatThrownBy(() -> Company.create(UUID.randomUUID(), "Acme", "Acme", "Acme VN",
                null, null, "VN", null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("slug");
    }
}
