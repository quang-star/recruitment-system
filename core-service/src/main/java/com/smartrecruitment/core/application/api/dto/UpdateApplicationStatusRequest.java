package com.smartrecruitment.core.application.api.dto;

import com.smartrecruitment.core.application.domain.ApplicationStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateApplicationStatusRequest(@NotNull ApplicationStatus status, @Size(max = 2000) String reason,
                                             @NotNull Long version) {}
