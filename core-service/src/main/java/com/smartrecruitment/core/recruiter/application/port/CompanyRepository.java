package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.domain.Company;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CompanyRepository {
    Company insertWithOwner(Company company, UUID ownerUserId);
    Optional<Company> findByPublicIdForMember(UUID companyId, UUID userId);
    List<Company> findAllForMember(UUID userId);
    boolean isActiveMember(UUID companyId, UUID userId);
    boolean canManage(UUID companyId, UUID userId);

    default boolean canRecruit(UUID companyId, UUID userId) {
        return canManage(companyId, userId);
    }
    Optional<Company> update(Company company, long expectedVersion);
}
