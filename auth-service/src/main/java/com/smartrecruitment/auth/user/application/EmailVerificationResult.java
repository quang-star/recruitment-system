package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.domain.AuthUser;


public record EmailVerificationResult(Long userId, String email, String status) {

    public static EmailVerificationResult from(AuthUser user) {
        return new EmailVerificationResult(user.id(), user.email(), user.status().name());
    }
}
