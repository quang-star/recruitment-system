package com.smartrecruitment.core.application.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ApplyRequest(@NotNull UUID jobId, @NotNull UUID cvId, @NotNull UUID cvVersionId,
                           @Size(max = 5000) String coverLetter,
                           @NotNull Boolean consentAccepted, @NotNull @Size(max = 80) String policyVersion) {}
