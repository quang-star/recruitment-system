package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CompanyInvitationResponse(UUID invitationId, UUID companyId, String email, String role,
                                        UUID invitedByUserId, OffsetDateTime expiresAt,
                                        UUID acceptedByUserId, OffsetDateTime acceptedAt,
                                        OffsetDateTime revokedAt, OffsetDateTime createdAt, long version) {
    public static CompanyInvitationResponse from(CompanyInvitation invitation) {
        return new CompanyInvitationResponse(invitation.publicId(), invitation.companyId(), invitation.email(),
                invitation.role(), invitation.invitedByUserId(), invitation.expiresAt(),
                invitation.acceptedByUserId(), invitation.acceptedAt(), invitation.revokedAt(),
                invitation.createdAt(), invitation.version());
    }
}

