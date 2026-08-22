package com.smartrecruitment.core.job.domain;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JobVersionTests {
    @Test
    void normalizesCountryAndCurrency() {
        JobVersion version = new JobVersion(UUID.randomUUID(), 1, " Backend ", " Build APIs ", " Java ", null,
                null, "vn", WorkMode.REMOTE, EmploymentType.FULL_TIME, null, 1, null, null, "vnd", null,
                false, null, "a".repeat(64), UUID.randomUUID());

        assertThat(version.title()).isEqualTo("Backend");
        assertThat(version.countryCode()).isEqualTo("VN");
        assertThat(version.salaryCurrency()).isEqualTo("VND");
    }

    @Test
    void rejectsInvalidHashAndSalaryRange() {
        assertThatThrownBy(() -> new JobVersion(UUID.randomUUID(), 1, "Title", "Description", "Requirements",
                null, null, null, null, null, null, 1, null, null, null, null, false, null, "bad", UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new JobVersion(UUID.randomUUID(), 1, "Title", "Description", "Requirements",
                null, null, null, null, null, null, 1, java.math.BigDecimal.TEN, java.math.BigDecimal.ONE,
                "VND", "MONTH", false, null, "a".repeat(64), UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
