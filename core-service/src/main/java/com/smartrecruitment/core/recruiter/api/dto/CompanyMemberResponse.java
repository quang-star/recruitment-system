package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.CompanyMember;

import java.time.OffsetDateTime;

public record CompanyMemberResponse(Long memberId, Long companyId, Long userId, String role, String status,
                                    OffsetDateTime joinedAt, long version) {
    public static CompanyMemberResponse from(CompanyMember member) {
        return new CompanyMemberResponse(member.id(), member.companyId(), member.userId(), member.role(),
                member.status(), member.joinedAt(), member.version());
    }
}

