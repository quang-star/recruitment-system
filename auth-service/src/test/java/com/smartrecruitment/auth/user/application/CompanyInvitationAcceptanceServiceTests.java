package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.CompanyInvitationClient;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CompanyInvitationAcceptanceServiceTests {
    private static final Long USER_ID = 42L;
    private static final String EMAIL = "candidate@example.test";
    private static final Instant NOW = Instant.parse("2026-11-20T08:00:00Z");

    private final AuthCurrentUserService currentUser = mock(AuthCurrentUserService.class);
    private final CompanyInvitationClient invitations = mock(CompanyInvitationClient.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final CompanyInvitationAcceptanceService service = new CompanyInvitationAcceptanceService(
            currentUser, invitations, roles, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void addsRecruiterRoleToTheExistingVerifiedAccountAfterCoreConfirmsMembership() {
        var member = new CompanyInvitationClient.Membership(100L, USER_ID, "VIEWER", "ACTIVE");
        when(currentUser.get(USER_ID)).thenReturn(candidate(true));
        when(invitations.accept("access", "invite")).thenReturn(member);

        assertThat(service.accept(USER_ID, EMAIL, "access", "invite")).isEqualTo(member);
        var order = inOrder(invitations, roles);
        order.verify(invitations).accept("access", "invite");
        order.verify(roles).assignRecruiterRole(USER_ID, NOW);
        order.verifyNoMoreInteractions();
    }

    @Test
    void rejectsUnverifiedAccountBeforeCallingCore() {
        when(currentUser.get(USER_ID)).thenReturn(candidate(false));

        assertThatThrownBy(() -> service.accept(USER_ID, EMAIL, "access", "invite"))
                .isInstanceOf(CompanyInvitationAcceptanceException.class);
        verifyNoInteractions(invitations, roles);
    }

    @Test
    void neverGrantsRoleWhenCoreRejectsTheInvitationOrReturnsAnotherUser() {
        when(currentUser.get(USER_ID)).thenReturn(candidate(true));
        when(invitations.accept("access", "invite"))
                .thenThrow(new CompanyInvitationAcceptanceException(CompanyInvitationAcceptanceException.Reason.CONFLICT))
                .thenReturn(new CompanyInvitationClient.Membership(100L, 7L, "RECRUITER", "ACTIVE"));

        assertThatThrownBy(() -> service.accept(USER_ID, EMAIL, "access", "invite"))
                .isInstanceOf(CompanyInvitationAcceptanceException.class);
        assertThatThrownBy(() -> service.accept(USER_ID, EMAIL, "access", "invite"))
                .isInstanceOf(CompanyInvitationAcceptanceException.class);
        verifyNoInteractions(roles);
    }

    private static CurrentUserResult candidate(boolean verified) {
        return new CurrentUserResult(USER_ID, EMAIL, "ACTIVE", verified, List.of("CANDIDATE"), false, true);
    }
}
