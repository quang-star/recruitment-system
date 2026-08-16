package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.domain.AuthUser;

import java.util.UUID;

public record RegistrationResult(UUID userId, String email, String status, boolean verificationRequired) {

    public static RegistrationResult from(AuthUser user) {
        return new RegistrationResult(user.publicId(), user.email(), user.status().name(), true);
    }
}
