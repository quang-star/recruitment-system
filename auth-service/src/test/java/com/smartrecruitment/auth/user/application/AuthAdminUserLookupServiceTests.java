package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AuthAdminUserLookupServiceTests {
    private final AuthUserRepository users = mock(AuthUserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final AuthAdminUserLookupService service = new AuthAdminUserLookupService(users, roles);

    @Test
    void returnsEmptyWithoutQueryingWhenIdsAreEmpty() {
        assertThat(service.findByIds(List.of())).isEmpty();
        verifyNoInteractions(users, roles);
    }

    @Test
    void mapsUsersWithActiveRoles() {
        Instant now = Instant.parse("2026-11-18T10:00:00Z");
        AuthUser u4 = new AuthUser(4L, "recruiter@demo.local", "recruiter@demo.local",
                com.smartrecruitment.auth.user.domain.UserStatus.ACTIVE, now, null, now, now, 0);
        when(users.findByIds(java.util.Set.of(4L))).thenReturn(List.of(u4));
        when(roles.findActiveRoleCodesByUserIds(List.of(4L))).thenReturn(Map.of(4L, List.of("RECRUITER")));

        List<AuthAdminUserLookupService.UserSummary> result = service.findByIds(List.of(4L, 4L));

        assertThat(result).containsExactly(
                new AuthAdminUserLookupService.UserSummary("4", "recruiter@demo.local", List.of("RECRUITER"), "ACTIVE"));
    }
}
