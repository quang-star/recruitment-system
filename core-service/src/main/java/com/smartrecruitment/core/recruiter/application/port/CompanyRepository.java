package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.OffsetDateTime;

public interface CompanyRepository {
    Company insertWithOwner(Company company, UUID ownerUserId);
    Optional<Company> findByPublicIdForMember(UUID companyId, UUID userId);
    List<Company> findAllForMember(UUID userId);
    boolean isActiveMember(UUID companyId, UUID userId);
    boolean canManage(UUID companyId, UUID userId);
    default List<CompanyMember> findMembersForMember(UUID companyId, UUID viewerUserId) { return List.of(); }
    default Optional<CompanyMember> findMember(UUID companyId, UUID userId) { return Optional.empty(); }
    default Optional<CompanyMember> findMemberById(UUID companyId, UUID memberId) { return Optional.empty(); }
    default Optional<CompanyMember> updateMember(UUID companyId, UUID memberId, String role, String status,
                                                 long expectedVersion, OffsetDateTime now) {
        return Optional.empty();
    }

    default boolean canRecruit(UUID companyId, UUID userId) {
        return canManage(companyId, userId);
    }
    Optional<Company> update(Company company, long expectedVersion);
}
