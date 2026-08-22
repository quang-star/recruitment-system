package com.smartrecruitment.core.job.api.dto;

import com.smartrecruitment.core.job.domain.EmploymentType;
import com.smartrecruitment.core.job.domain.WorkMode;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record PutJobRequest(
        @NotBlank @Size(max = 240) String title,
        @NotBlank @Size(max = 30000) String description,
        @NotBlank @Size(max = 30000) String requirementsText,
        @Size(max = 30000) String benefitsText,
        @Size(max = 300) String locationText,
        @Pattern(regexp = "[A-Z]{2}") String countryCode,
        WorkMode workMode,
        EmploymentType employmentType,
        @Size(max = 30) String seniorityLevel,
        @Min(1) int openings,
        BigDecimal salaryMin,
        BigDecimal salaryMax,
        @Pattern(regexp = "[A-Z]{3}") String salaryCurrency,
        @Pattern(regexp = "HOUR|MONTH|YEAR") String salaryPeriod,
        boolean salaryNegotiable,
        OffsetDateTime applicationDeadline,
        Long version) {
}
