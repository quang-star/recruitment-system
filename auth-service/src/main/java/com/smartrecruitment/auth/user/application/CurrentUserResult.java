package com.smartrecruitment.auth.user.application;

import java.util.List;
import java.util.UUID;

public record CurrentUserResult(
        UUID userId,
        String email,
        String status,
        boolean emailVerified,
        List<String> roles
) {
    public CurrentUserResult {
        roles = List.copyOf(roles);
    }
}
