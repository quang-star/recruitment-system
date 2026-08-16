package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AuthCurrentUserService {
    private final AuthUserRepository users;
    private final RoleRepository roles;

    public AuthCurrentUserService(AuthUserRepository users, RoleRepository roles) {
        this.users = users;
        this.roles = roles;
    }

    @Transactional(readOnly = true)
    public CurrentUserResult get(UUID userId) {
        AuthUser user = users.findByPublicId(userId)
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(CurrentUserUnavailableException::new);
        return new CurrentUserResult(
                user.publicId(),
                user.email(),
                user.status().name(),
                user.emailVerifiedAt() != null,
                roles.findActiveRoleCodes(user.id())
        );
    }
}
