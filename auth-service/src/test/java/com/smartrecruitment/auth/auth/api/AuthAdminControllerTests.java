package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.user.application.AuthAdminUserLookupService;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AuthAdminControllerTests {
    private final AuthAdminUserLookupService service = mock(AuthAdminUserLookupService.class);
    private final AuthAdminController controller = new AuthAdminController(service);

    @Test
    void rejectsNonAdminCallers() {
        Jwt recruiterJwt = jwtWithRoles(List.of("RECRUITER"));
        assertThatThrownBy(() -> controller.findUsers(recruiterJwt, List.of("4")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");
        verifyNoInteractions(service);
    }

    @Test
    void parsesCommaSeparatedIdsAndDelegatesToLookupService() {
        Jwt adminJwt = jwtWithRoles(List.of("SYSTEM_ADMIN"));
        List<AuthAdminUserLookupService.UserSummary> expected = List.of(
                new AuthAdminUserLookupService.UserSummary("4", "recruiter@demo.local", List.of("RECRUITER"), "ACTIVE"),
                new AuthAdminUserLookupService.UserSummary("7", "admin@demo.local", List.of("SYSTEM_ADMIN"), "ACTIVE"));
        when(service.findByIds(List.of(4L, 7L))).thenReturn(expected);

        List<AuthAdminUserLookupService.UserSummary> result = controller.findUsers(adminJwt, List.of("4, 7"));

        assertThat(result).isEqualTo(expected);
        verify(service).findByIds(List.of(4L, 7L));
    }

    @Test
    void rejectsInvalidUserIds() {
        Jwt adminJwt = jwtWithRoles(List.of("SYSTEM_ADMIN"));
        assertThatThrownBy(() -> controller.findUsers(adminJwt, List.of("not-a-number")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
        verifyNoInteractions(service);
    }

    private static Jwt jwtWithRoles(List<String> roles) {
        return Jwt.withTokenValue("synthetic")
                .header("alg", "none")
                .subject("1")
                .claim("roles", roles)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .build();
    }
}
