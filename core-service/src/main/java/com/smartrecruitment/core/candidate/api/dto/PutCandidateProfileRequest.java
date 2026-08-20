package com.smartrecruitment.core.candidate.api.dto;

import com.smartrecruitment.core.candidate.domain.ProfileVisibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PutCandidateProfileRequest(
        @NotBlank @Size(max = 120) String displayName,
        @Size(max = 200) String headline,
        @Size(max = 160) String locationText,
        @NotNull ProfileVisibility visibility,
        Long version) {
}
