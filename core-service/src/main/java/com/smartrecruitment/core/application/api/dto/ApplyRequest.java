package com.smartrecruitment.core.application.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;


public record ApplyRequest(@NotNull Long jobId, @NotNull Long cvId, @NotNull Long cvVersionId,
                           @Size(max = 5000) String coverLetter,
                           @NotNull Boolean consentAccepted, @NotNull @Size(max = 80) String policyVersion) {}
