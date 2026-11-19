package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Resolves bounded user account summaries for system administrator audit views. */
@Service
public class AuthAdminUserLookupService {
    private final AuthUserRepository users;
    private final RoleRepository roles;

    public AuthAdminUserLookupService(AuthUserRepository users, RoleRepository roles) {
        this.users = users;
        this.roles = roles;
    }

    public List<UserSummary> findByIds(Collection<Long> rawIds) {
        if (rawIds == null || rawIds.isEmpty()) return List.of();
        Set<Long> ids = new LinkedHashSet<>();
        for (Long id : rawIds) {
            if (id != null && id > 0) ids.add(id);
        }
        if (ids.isEmpty()) return List.of();
        List<AuthUser> found = users.findByIds(ids);
        if (found.isEmpty()) return List.of();
        List<Long> foundIds = found.stream().map(AuthUser::id).filter(Objects::nonNull).toList();
        Map<Long, List<String>> roleMap = roles.findActiveRoleCodesByUserIds(foundIds);
        return found.stream()
                .map(user -> new UserSummary(
                        user.id().toString(),
                        user.email(),
                        roleMap.getOrDefault(user.id(), List.of()),
                        user.status().name()))
                .toList();
    }

    public record UserSummary(String userId, String email, List<String> roles, String status) {}
}
