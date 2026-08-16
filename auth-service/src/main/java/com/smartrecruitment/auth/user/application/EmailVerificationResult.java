package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.domain.AuthUser;

import java.util.UUID;

public record EmailVerificationResult(UUID userId, String email, String status) {

    public static EmailVerificationResult from(AuthUser user) {
        return new EmailVerificationResult(user.publicId(), user.email(), user.status().name());
    }
}
