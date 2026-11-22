package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.shared.api.SubjectId;
import com.smartrecruitment.auth.user.application.CompanyInvitationAcceptanceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/auth/company-invitations")
public class AuthCompanyInvitationController {
    private final CompanyInvitationAcceptanceService invitations;

    public AuthCompanyInvitationController(CompanyInvitationAcceptanceService invitations) {
        this.invitations = invitations;
    }

    @PostMapping("/accept")
    public AcceptResponse accept(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AcceptRequest request) {
        var member = invitations.accept(SubjectId.parse(jwt.getSubject()), jwt.getClaimAsString("email"),
                jwt.getTokenValue(), request.token());
        return new AcceptResponse(member.companyId().toString(), member.role(), member.status());
    }

    public record AcceptRequest(@NotBlank @Size(min = 64, max = 128) String token) {}
    public record AcceptResponse(String companyId, String role, String status) {}
}
