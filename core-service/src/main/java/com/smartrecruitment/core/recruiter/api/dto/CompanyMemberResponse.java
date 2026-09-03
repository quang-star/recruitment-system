package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.CompanyMember;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CompanyMemberResponse(UUID memberId, UUID companyId, UUID userId, String role, String status,
                                    OffsetDateTime joinedAt, long version) {
    public static CompanyMemberResponse from(CompanyMember member) {
        return new CompanyMemberResponse(member.publicId(), member.companyId(), member.userId(), member.role(),
                member.status(), member.joinedAt(), member.version());
    }
}

