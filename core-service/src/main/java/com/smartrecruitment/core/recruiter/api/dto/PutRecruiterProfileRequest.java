package com.smartrecruitment.core.recruiter.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PutRecruiterProfileRequest(
        @NotBlank @Size(max = 160) String displayName,
        @Size(max = 160) String businessTitle,
        @Size(max = 32) String businessPhone,
        Long version) {
}
