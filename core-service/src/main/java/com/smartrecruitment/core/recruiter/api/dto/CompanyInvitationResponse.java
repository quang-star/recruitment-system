package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;

import java.time.OffsetDateTime;

public record CompanyInvitationResponse(Long invitationId, Long companyId, String email, String role,
                                        Long invitedByUserId, OffsetDateTime expiresAt,
                                        Long acceptedByUserId, OffsetDateTime acceptedAt,
                                        OffsetDateTime revokedAt, OffsetDateTime createdAt, long version) {
    public static CompanyInvitationResponse from(CompanyInvitation invitation) {
        return new CompanyInvitationResponse(invitation.id(), invitation.companyId(), invitation.email(),
                invitation.role(), invitation.invitedByUserId(), invitation.expiresAt(),
                invitation.acceptedByUserId(), invitation.acceptedAt(), invitation.revokedAt(),
                invitation.createdAt(), invitation.version());
    }
}

