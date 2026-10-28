package com.smartrecruitment.auth.user.application;

import java.util.List;

public record CurrentUserResult(
        Long userId,
        String email,
        String status,
        boolean emailVerified,
        List<String> roles
) {
    public CurrentUserResult {
        roles = List.copyOf(roles);
    }
}
