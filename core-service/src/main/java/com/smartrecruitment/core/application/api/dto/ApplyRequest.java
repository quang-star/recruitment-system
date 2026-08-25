package com.smartrecruitment.core.application.api.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ApplyRequest(@NotNull UUID jobId, @NotNull UUID cvId,
                           @NotNull Boolean consentAccepted, @NotNull String policyVersion) {}
