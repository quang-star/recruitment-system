package com.smartrecruitment.core.recruiter.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AcceptCompanyInvitationRequest(@NotBlank @Size(min = 64, max = 128) String token) {
}

