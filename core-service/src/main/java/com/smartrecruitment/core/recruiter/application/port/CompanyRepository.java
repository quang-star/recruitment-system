package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;

import java.util.List;
import java.util.Optional;
import java.time.OffsetDateTime;

public interface CompanyRepository {
    Company insertWithOwner(Company company, Long ownerUserId);
    Optional<Company> findByIdForMember(Long companyId, Long userId);
    List<Company> findAllForMember(Long userId);
    boolean isActiveMember(Long companyId, Long userId);
    boolean canManage(Long companyId, Long userId);
    default List<CompanyMember> findMembersForMember(Long companyId, Long viewerUserId) { return List.of(); }
    default Optional<CompanyMember> findMember(Long companyId, Long userId) { return Optional.empty(); }
    default Optional<CompanyMember> findMemberById(Long companyId, Long memberId) { return Optional.empty(); }
    default Optional<CompanyMember> updateMember(Long companyId, Long memberId, String role, String status,
                                                 long expectedVersion, OffsetDateTime now) {
        return Optional.empty();
    }

    default boolean canRecruit(Long companyId, Long userId) {
        return canManage(companyId, userId);
    }
    default List<Company> findPublic() { return List.of(); }
    default Optional<Company> findById(Long companyId) { return Optional.empty(); }
    Optional<Company> update(Company company, long expectedVersion);
}
