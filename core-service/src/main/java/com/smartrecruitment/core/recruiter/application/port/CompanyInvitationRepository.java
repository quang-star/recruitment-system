package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CompanyInvitationRepository {
    CompanyInvitation insert(CompanyInvitation invitation);
    List<CompanyInvitation> findAll(UUID companyId);
    Optional<CompanyInvitation> findActive(UUID companyId, String normalizedEmail, OffsetDateTime now);
    Optional<CompanyInvitation> findActiveByTokenHash(String tokenHash, OffsetDateTime now);
    int revokeExpired(UUID companyId, String normalizedEmail, OffsetDateTime now);
    boolean revoke(UUID companyId, UUID invitationId, long expectedVersion, OffsetDateTime now);
    Optional<CompanyMember> accept(CompanyInvitation invitation, UUID userId, OffsetDateTime now);
}

