package com.smartrecruitment.auth.user.application;

import com.smartrecruitment.auth.user.application.port.CompanyInvitationClient;
import com.smartrecruitment.auth.user.application.port.RoleRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;

@Service
public class CompanyInvitationAcceptanceService {
    private final AuthCurrentUserService currentUser;
    private final CompanyInvitationClient invitations;
    private final RoleRepository roles;
    private final Clock clock;

    public CompanyInvitationAcceptanceService(AuthCurrentUserService currentUser, CompanyInvitationClient invitations,
                                              RoleRepository roles, Clock clock) {
        this.currentUser = currentUser;
        this.invitations = invitations;
        this.roles = roles;
        this.clock = clock;
    }

    public CompanyInvitationClient.Membership accept(Long userId, String email, String accessToken, String token) {
        var account = currentUser.get(userId);
        if (!account.emailVerified() || !account.email().equals(email)
                || (!account.roles().contains("CANDIDATE") && !account.roles().contains("RECRUITER"))) {
            throw new CompanyInvitationAcceptanceException(CompanyInvitationAcceptanceException.Reason.ACCOUNT_INELIGIBLE);
        }
        var member = invitations.accept(accessToken, token);
        if (!userId.equals(member.userId()) || member.companyId() == null || !"ACTIVE".equals(member.status())) {
            throw new CompanyInvitationAcceptanceException(CompanyInvitationAcceptanceException.Reason.UNAVAILABLE);
        }
        roles.assignRecruiterRole(userId, clock.instant());
        return member;
    }
}
