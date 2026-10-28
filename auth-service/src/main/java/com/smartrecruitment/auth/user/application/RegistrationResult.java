package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.domain.AuthUser;


public record RegistrationResult(Long userId, String email, String status, boolean verificationRequired) {

    public static RegistrationResult from(AuthUser user) {
        return new RegistrationResult(user.id(), user.email(), user.status().name(), true);
    }
}
