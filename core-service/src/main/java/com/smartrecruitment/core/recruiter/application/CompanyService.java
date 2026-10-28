package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
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
    public Company create(Long ownerUserId, String legalName, String displayName, String slug,
                          String description, String websiteUrl, String countryCode,
                          String registrationNumber, String sizeRange, String logoUrl, String coverImageUrl) {
        return companies.insertWithOwner(Company.create(ownerUserId, legalName, displayName, slug,
                description, websiteUrl, countryCode, registrationNumber, sizeRange, logoUrl, coverImageUrl), ownerUserId);
    }

    @Transactional
    public Company create(Long ownerUserId, String legalName, String displayName, String slug,
                          String description, String websiteUrl, String countryCode,
                          String registrationNumber, String sizeRange) {
        return create(ownerUserId, legalName, displayName, slug, description, websiteUrl, countryCode,
                registrationNumber, sizeRange, null, null);
    }

    @Transactional(readOnly = true)
    public List<Company> findMine(Long userId) {
        return companies.findAllForMember(userId);
    }

    @Transactional(readOnly = true)
    public Company getMine(Long userId, Long companyId) {
        return companies.findByIdForMember(companyId, userId).orElseThrow(CompanyNotFoundException::new);
    }

    @Transactional(readOnly = true)
    public List<Company> findPublic() {
        return companies.findPublic();
    }

    @Transactional(readOnly = true)
    public Company getPublic(Long companyId) {
        return companies.findById(companyId).orElseThrow(CompanyNotFoundException::new);
    }

    @Transactional(readOnly = true)
    public List<CompanyMember> members(Long userId, Long companyId) {
        if (!companies.isActiveMember(companyId, userId)) throw new CompanyNotFoundException();
        return companies.findMembersForMember(companyId, userId);
    }

    @Transactional
    public Company updateMine(Long userId, Long companyId, String legalName, String displayName, String slug,
                              String description, String websiteUrl, String countryCode,
                              String registrationNumber, String sizeRange, String logoUrl, String coverImageUrl,
                              Long expectedVersion) {
        if (!companies.canManage(companyId, userId)) throw new CompanyNotFoundException();
        Company existing = companies.findByIdForMember(companyId, userId)
                .orElseThrow(CompanyNotFoundException::new);
        if (expectedVersion == null || expectedVersion != existing.version()) {
            throw new CompanyConflictException();
        }
        Company updated = existing.update(legalName, displayName, slug, description, websiteUrl,
                countryCode, registrationNumber, sizeRange, logoUrl, coverImageUrl);
        return companies.update(updated, expectedVersion).orElseThrow(CompanyConflictException::new);
    }

    @Transactional
    public Company updateMine(Long userId, Long companyId, String legalName, String displayName, String slug,
                              String description, String websiteUrl, String countryCode,
                              String registrationNumber, String sizeRange, Long expectedVersion) {
        return updateMine(userId, companyId, legalName, displayName, slug, description, websiteUrl,
                countryCode, registrationNumber, sizeRange, null, null, expectedVersion);
    }

    @Transactional
    public CompanyMember updateMember(Long actorUserId, Long companyId, Long memberId, String role,
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
