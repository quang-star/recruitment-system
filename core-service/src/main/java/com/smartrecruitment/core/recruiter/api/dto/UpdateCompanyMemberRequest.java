package com.smartrecruitment.core.recruiter.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record UpdateCompanyMemberRequest(
        @NotBlank @Pattern(regexp = "COMPANY_ADMIN|RECRUITER|VIEWER") String role,
        @NotBlank @Pattern(regexp = "ACTIVE|SUSPENDED|LEFT") String status,
        @NotNull Long version) {
}

