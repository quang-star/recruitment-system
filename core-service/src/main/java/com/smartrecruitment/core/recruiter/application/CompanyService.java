package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Set;

@Service
public class CompanyService {
    private static final Set<String> MANAGEABLE_ROLES = Set.of("COMPANY_ADMIN", "RECRUITER", "VIEWER");
    private static final Set<String> MANAGEABLE_STATUSES = Set.of("ACTIVE", "SUSPENDED", "LEFT");
    private final CompanyRepository companies;

    public CompanyService(CompanyRepository companies) {
        this.companies = companies;
    }

    @Transactional
    public Company create(UUID ownerUserId, String legalName, String displayName, String slug,
                          String description, String websiteUrl, String countryCode,
                          String registrationNumber, String sizeRange) {
        return companies.insertWithOwner(Company.create(ownerUserId, legalName, displayName, slug,
                description, websiteUrl, countryCode, registrationNumber, sizeRange), ownerUserId);
    }

    @Transactional(readOnly = true)
    public List<Company> findMine(UUID userId) {
        return companies.findAllForMember(userId);
    }

    @Transactional(readOnly = true)
    public Company getMine(UUID userId, UUID companyId) {
        return companies.findByPublicIdForMember(companyId, userId).orElseThrow(CompanyNotFoundException::new);
    }

    @Transactional(readOnly = true)
    public List<CompanyMember> members(UUID userId, UUID companyId) {
        if (!companies.isActiveMember(companyId, userId)) throw new CompanyNotFoundException();
        return companies.findMembersForMember(companyId, userId);
    }

    @Transactional
    public Company updateMine(UUID userId, UUID companyId, String legalName, String displayName, String slug,
                              String description, String websiteUrl, String countryCode,
                              String registrationNumber, String sizeRange, Long expectedVersion) {
        if (!companies.canManage(companyId, userId)) throw new CompanyNotFoundException();
        Company existing = companies.findByPublicIdForMember(companyId, userId)
                .orElseThrow(CompanyNotFoundException::new);
        if (expectedVersion == null || expectedVersion != existing.version()) {
            throw new CompanyConflictException();
        }
        Company updated = existing.update(legalName, displayName, slug, description, websiteUrl,
                countryCode, registrationNumber, sizeRange);
        return companies.update(updated, expectedVersion).orElseThrow(CompanyConflictException::new);
    }

    @Transactional
    public CompanyMember updateMember(UUID actorUserId, UUID companyId, UUID memberId, String role,
                                      String status, Long expectedVersion) {
        if (!companies.canManage(companyId, actorUserId)) throw new CompanyNotFoundException();
        CompanyMember existing = companies.findMemberById(companyId, memberId)
                .orElseThrow(CompanyMemberNotFoundException::new);
        if ("OWNER".equals(existing.role())) {
            throw new CompanyMemberConflictException("The company owner role and status cannot be changed");
        }
        String normalizedRole = role == null ? "" : role.trim().toUpperCase(java.util.Locale.ROOT);
        String normalizedStatus = status == null ? "" : status.trim().toUpperCase(java.util.Locale.ROOT);
        if (!MANAGEABLE_ROLES.contains(normalizedRole)) throw new IllegalArgumentException("Invalid member role");
        if (!MANAGEABLE_STATUSES.contains(normalizedStatus)) throw new IllegalArgumentException("Invalid member status");
        if ("LEFT".equals(existing.status())) {
            throw new CompanyMemberConflictException("A member who left must be invited again");
        }
        if (expectedVersion == null || expectedVersion != existing.version()) {
            throw new CompanyMemberConflictException("Company member changed; reload and try again");
        }
        return companies.updateMember(companyId, memberId, normalizedRole, normalizedStatus, expectedVersion,
                        OffsetDateTime.now(ZoneOffset.UTC))
                .orElseThrow(() -> new CompanyMemberConflictException("Company member changed; reload and try again"));
    }
}
