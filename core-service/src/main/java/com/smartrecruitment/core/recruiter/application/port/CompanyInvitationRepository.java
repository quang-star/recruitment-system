package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface CompanyInvitationRepository {
    CompanyInvitation insert(CompanyInvitation invitation);
    List<CompanyInvitation> findAll(Long companyId);
    Optional<CompanyInvitation> findActive(Long companyId, String normalizedEmail, OffsetDateTime now);
    Optional<CompanyInvitation> findActiveByTokenHash(String tokenHash, OffsetDateTime now);
    int revokeExpired(Long companyId, String normalizedEmail, OffsetDateTime now);
    boolean revoke(Long companyId, Long invitationId, long expectedVersion, OffsetDateTime now);
    Optional<CompanyMember> accept(CompanyInvitation invitation, Long userId, OffsetDateTime now);
}

