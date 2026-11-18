package com.smartrecruitment.auth.user.application;

import java.util.List;

public record CurrentUserResult(
        Long userId,
        String email,
        String status,
        boolean emailVerified,
        List<String> roles,
        boolean hasPassword,
        boolean googleLinked
) {
    public CurrentUserResult {
        roles = List.copyOf(roles);
    }

    public CurrentUserResult(Long userId, String email, String status, boolean emailVerified, List<String> roles) {
        this(userId, email, status, emailVerified, roles, true, false);
    }
}
