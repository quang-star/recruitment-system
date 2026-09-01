package com.smartrecruitment.core.application.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record WithdrawApplicationRequest(@NotBlank @Size(max = 2000) String reason, @NotNull Long version) { }
