package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class CompanyService {
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
}
