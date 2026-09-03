package com.smartrecruitment.core.recruiter.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record InviteCompanyMemberRequest(
        @NotBlank @Email @Size(max = 320) String email,
        @NotBlank @Pattern(regexp = "COMPANY_ADMIN|RECRUITER|VIEWER") String role) {
}

