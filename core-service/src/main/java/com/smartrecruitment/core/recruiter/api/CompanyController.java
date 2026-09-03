package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.api.dto.CompanyResponse;
import com.smartrecruitment.core.recruiter.api.dto.CreateCompanyRequest;
import com.smartrecruitment.core.recruiter.api.dto.CompanyMemberResponse;
import com.smartrecruitment.core.recruiter.api.dto.CompanyInvitationResponse;
import com.smartrecruitment.core.recruiter.api.dto.InviteCompanyMemberRequest;
import com.smartrecruitment.core.recruiter.api.dto.AcceptCompanyInvitationRequest;
import com.smartrecruitment.core.recruiter.api.dto.UpdateCompanyMemberRequest;
import com.smartrecruitment.core.recruiter.application.CompanyInvitationService;
import com.smartrecruitment.core.recruiter.application.CompanyService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/companies")
public class CompanyController {
    private final CompanyService companies;
    private final CompanyInvitationService invitations;

    public CompanyController(CompanyService companies, CompanyInvitationService invitations) {
        this.companies = companies;
        this.invitations = invitations;
    }

    @PostMapping
    public CompanyResponse create(@AuthenticationPrincipal Jwt jwt,
                                  @Valid @RequestBody CreateCompanyRequest request) {
        return CompanyResponse.from(companies.create(userId(jwt), request.legalName(), request.displayName(),
                request.slug(), request.description(), request.websiteUrl(), request.countryCode(),
                request.registrationNumber(), request.sizeRange()));
    }

    @GetMapping
    public List<CompanyResponse> findMine(@AuthenticationPrincipal Jwt jwt) {
        return companies.findMine(userId(jwt)).stream().map(CompanyResponse::from).toList();
    }

    @GetMapping("/{companyId}")
    public CompanyResponse getMine(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId) {
        return CompanyResponse.from(companies.getMine(userId(jwt), companyId));
    }

    @GetMapping("/{companyId}/members")
    public List<CompanyMemberResponse> members(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId) {
        return companies.members(userId(jwt), companyId).stream().map(CompanyMemberResponse::from).toList();
    }

    @PostMapping("/{companyId}/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    public CompanyInvitationResponse invite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId,
                                            @Valid @RequestBody InviteCompanyMemberRequest request) {
        return CompanyInvitationResponse.from(invitations.invite(userId(jwt), companyId,
                request.email(), request.role()));
    }

    @GetMapping("/{companyId}/invitations")
    public List<CompanyInvitationResponse> invitations(@AuthenticationPrincipal Jwt jwt,
                                                       @PathVariable UUID companyId) {
        return invitations.list(userId(jwt), companyId).stream()
                .map(CompanyInvitationResponse::from).toList();
    }

    @DeleteMapping("/{companyId}/invitations/{invitationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeInvitation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId,
                                 @PathVariable UUID invitationId, @RequestParam long version) {
        invitations.revoke(userId(jwt), companyId, invitationId, version);
    }

    @PostMapping("/invitations/accept")
    public CompanyMemberResponse acceptInvitation(@AuthenticationPrincipal Jwt jwt,
                                                  @Valid @RequestBody AcceptCompanyInvitationRequest request) {
        return CompanyMemberResponse.from(invitations.accept(userId(jwt), jwt.getClaimAsString("email"),
                request.token()));
    }

    @PatchMapping("/{companyId}/members/{memberId}")
    public CompanyMemberResponse updateMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId,
                                              @PathVariable UUID memberId,
                                              @Valid @RequestBody UpdateCompanyMemberRequest request) {
        return CompanyMemberResponse.from(companies.updateMember(userId(jwt), companyId, memberId,
                request.role(), request.status(), request.version()));
    }

    @PutMapping("/{companyId}")
    public CompanyResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId,
                                  @Valid @RequestBody CreateCompanyRequest request) {
        return CompanyResponse.from(companies.updateMine(userId(jwt), companyId, request.legalName(),
                request.displayName(), request.slug(), request.description(), request.websiteUrl(),
                request.countryCode(), request.registrationNumber(), request.sizeRange(), requestVersion(request)));
    }

    private Long requestVersion(CreateCompanyRequest request) {
        return request.version();
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
