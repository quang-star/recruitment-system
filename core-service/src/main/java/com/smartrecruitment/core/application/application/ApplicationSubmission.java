package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.domain.Application;

import java.util.Objects;

public record ApplicationSubmission(Application application, boolean created) {
    public ApplicationSubmission {
        Objects.requireNonNull(application, "application");
    }
}

