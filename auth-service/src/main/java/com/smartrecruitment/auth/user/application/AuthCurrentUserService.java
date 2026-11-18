package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.GoogleIdentityRepository;
import com.smartrecruitment.auth.user.application.port.PasswordCredentialRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


@Service
public class AuthCurrentUserService {
    private final AuthUserRepository users;
    private final RoleRepository roles;
    private final GoogleIdentityRepository googleIdentities;
    private final PasswordCredentialRepository passwordCredentials;

    public AuthCurrentUserService(AuthUserRepository users, RoleRepository roles) {
        this(users, roles, null, null);
    }

    @Autowired
    public AuthCurrentUserService(AuthUserRepository users, RoleRepository roles,
                                  GoogleIdentityRepository googleIdentities,
                                  PasswordCredentialRepository passwordCredentials) {
        this.users = users;
        this.roles = roles;
        this.googleIdentities = googleIdentities;
        this.passwordCredentials = passwordCredentials;
    }

    @Transactional(readOnly = true)
    public CurrentUserResult get(Long userId) {
        AuthUser user = users.findById(userId)
                .filter(value -> value.status() == UserStatus.ACTIVE)
                .orElseThrow(CurrentUserUnavailableException::new);
        boolean hasPassword = passwordCredentials == null || passwordCredentials.existsByUserId(user.id());
        boolean googleLinked = googleIdentities != null && googleIdentities.existsByUserId(user.id());
        return new CurrentUserResult(
                user.id(),
                user.email(),
                user.status().name(),
                user.emailVerifiedAt() != null,
                roles.findActiveRoleCodes(user.id()),
                hasPassword,
                googleLinked
        );
    }
}
