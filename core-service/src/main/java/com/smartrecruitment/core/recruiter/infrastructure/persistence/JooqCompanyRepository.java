package com.smartrecruitment.core.recruiter.infrastructure.persistence;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;

@Repository
public class JooqCompanyRepository implements CompanyRepository {
    private final DSLContext dsl;

    public JooqCompanyRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public Company insertWithOwner(Company company, UUID ownerUserId) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        var companyRecord = dsl.insertInto(COMPANIES)
                .set(COMPANIES.PUBLIC_ID, company.publicId())
                .set(COMPANIES.LEGAL_NAME, company.legalName())
                .set(COMPANIES.DISPLAY_NAME, company.displayName())
                .set(COMPANIES.SLUG, company.slug())
                .set(COMPANIES.DESCRIPTION, company.description())
                .set(COMPANIES.WEBSITE_URL, company.websiteUrl())
                .set(COMPANIES.COUNTRY_CODE, company.countryCode())
                .set(COMPANIES.REGISTRATION_NUMBER, company.registrationNumber())
                .set(COMPANIES.SIZE_RANGE, company.sizeRange())
                .set(COMPANIES.STATUS, company.status().name())
                .set(COMPANIES.VERIFICATION_STATUS, company.verificationStatus().name())
                .set(COMPANIES.CREATED_BY_USER_ID, company.createdByUserId())
                .set(COMPANIES.CREATED_AT, now)
                .set(COMPANIES.UPDATED_AT, now)
                .set(COMPANIES.VERSION, 0L)
                .returning()
                .fetchOne();
        if (companyRecord == null) throw new IllegalStateException("Insert company returned no record");

        dsl.insertInto(COMPANY_MEMBERS)
                .set(COMPANY_MEMBERS.PUBLIC_ID, UUID.randomUUID())
                .set(COMPANY_MEMBERS.COMPANY_ID, companyRecord.getId())
                .set(COMPANY_MEMBERS.USER_ID, ownerUserId)
                .set(COMPANY_MEMBERS.ROLE, "OWNER")
                .set(COMPANY_MEMBERS.STATUS, "ACTIVE")
                .set(COMPANY_MEMBERS.JOINED_AT, now)
                .set(COMPANY_MEMBERS.CREATED_AT, now)
                .set(COMPANY_MEMBERS.UPDATED_AT, now)
                .set(COMPANY_MEMBERS.VERSION, 0L)
                .execute();
        return toDomain(companyRecord);
    }

    @Override
    public Optional<Company> findByPublicIdForMember(UUID companyId, UUID userId) {
        return dsl.select(COMPANIES.fields())
                .from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANIES.PUBLIC_ID.eq(companyId))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANIES.STATUS.ne(CompanyStatus.CLOSED.name()))
                .fetchOptional(record -> toDomain(record.into(COMPANIES)));
    }

    @Override
    public List<Company> findAllForMember(UUID userId) {
        return dsl.select(COMPANIES.fields())
                .from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANIES.STATUS.ne(CompanyStatus.CLOSED.name()))
                .orderBy(COMPANIES.DISPLAY_NAME.asc())
                .fetch(record -> toDomain(record.into(COMPANIES)));
    }

    @Override
    public boolean isActiveMember(UUID companyId, UUID userId) {
        return dsl.fetchExists(dsl.selectOne()
                .from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANIES.PUBLIC_ID.eq(companyId))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")));
    }

    @Override
    public boolean canManage(UUID companyId, UUID userId) {
        return dsl.fetchExists(dsl.selectOne()
                .from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANIES.PUBLIC_ID.eq(companyId))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANY_MEMBERS.ROLE.in("OWNER", "COMPANY_ADMIN")));
    }

    @Override
    public List<CompanyMember> findMembersForMember(UUID companyId, UUID viewerUserId) {
        if (!isActiveMember(companyId, viewerUserId)) return List.of();
        Long internalCompanyId = dsl.select(COMPANIES.ID).from(COMPANIES)
                .where(COMPANIES.PUBLIC_ID.eq(companyId)).fetchOne(COMPANIES.ID);
        if (internalCompanyId == null) return List.of();
        return dsl.selectFrom(COMPANY_MEMBERS)
                .where(COMPANY_MEMBERS.COMPANY_ID.eq(internalCompanyId))
                .orderBy(COMPANY_MEMBERS.JOINED_AT.asc())
                .fetch(record -> toMember(record, companyId));
    }

    @Override
    public Optional<CompanyMember> findMember(UUID companyId, UUID userId) {
        Long internalCompanyId = internalCompanyId(companyId);
        if (internalCompanyId == null) return Optional.empty();
        return dsl.selectFrom(COMPANY_MEMBERS)
                .where(COMPANY_MEMBERS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .fetchOptional(record -> toMember(record, companyId));
    }

    @Override
    public Optional<CompanyMember> findMemberById(UUID companyId, UUID memberId) {
        Long internalCompanyId = internalCompanyId(companyId);
        if (internalCompanyId == null) return Optional.empty();
        return dsl.selectFrom(COMPANY_MEMBERS)
                .where(COMPANY_MEMBERS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_MEMBERS.PUBLIC_ID.eq(memberId))
                .fetchOptional(record -> toMember(record, companyId));
    }

    @Override
    public Optional<CompanyMember> updateMember(UUID companyId, UUID memberId, String role, String status,
                                                long expectedVersion, OffsetDateTime now) {
        Long internalCompanyId = internalCompanyId(companyId);
        if (internalCompanyId == null) return Optional.empty();
        var update = dsl.update(COMPANY_MEMBERS)
                .set(COMPANY_MEMBERS.ROLE, role)
                .set(COMPANY_MEMBERS.STATUS, status)
                .set(COMPANY_MEMBERS.UPDATED_AT, now)
                .set(COMPANY_MEMBERS.VERSION, COMPANY_MEMBERS.VERSION.plus(1L));
        if ("LEFT".equals(status)) update.set(COMPANY_MEMBERS.LEFT_AT, now);
        return update.where(COMPANY_MEMBERS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_MEMBERS.PUBLIC_ID.eq(memberId))
                .and(COMPANY_MEMBERS.ROLE.ne("OWNER"))
                .and(COMPANY_MEMBERS.STATUS.ne("LEFT"))
                .and(COMPANY_MEMBERS.VERSION.eq(expectedVersion))
                .returning()
                .fetchOptional(record -> toMember(record, companyId));
    }

    @Override
    public boolean canRecruit(UUID companyId, UUID userId) {
        return dsl.fetchExists(dsl.selectOne()
                .from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANIES.PUBLIC_ID.eq(companyId))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANY_MEMBERS.ROLE.in("OWNER", "COMPANY_ADMIN", "RECRUITER")));
    }

    @Override
    public Optional<Company> update(Company company, long expectedVersion) {
        return dsl.update(COMPANIES)
                .set(COMPANIES.LEGAL_NAME, company.legalName())
                .set(COMPANIES.DISPLAY_NAME, company.displayName())
                .set(COMPANIES.SLUG, company.slug())
                .set(COMPANIES.DESCRIPTION, company.description())
                .set(COMPANIES.WEBSITE_URL, company.websiteUrl())
                .set(COMPANIES.COUNTRY_CODE, company.countryCode())
                .set(COMPANIES.REGISTRATION_NUMBER, company.registrationNumber())
                .set(COMPANIES.SIZE_RANGE, company.sizeRange())
                .set(COMPANIES.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(COMPANIES.VERSION, COMPANIES.VERSION.plus(1L))
                .where(COMPANIES.PUBLIC_ID.eq(company.publicId()))
                .and(COMPANIES.VERSION.eq(expectedVersion))
                .returning()
                .fetchOptional()
                .map(this::toDomain);
    }

    private Company toDomain(
            com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.CompaniesRecord record) {
        return new Company(record.getPublicId(), record.getLegalName(), record.getDisplayName(), record.getSlug(),
                record.getDescription(), record.getWebsiteUrl(), record.getCountryCode(),
                record.getRegistrationNumber(), record.getSizeRange(),
                CompanyStatus.valueOf(record.getStatus()),
                CompanyVerificationStatus.valueOf(record.getVerificationStatus()),
                record.getCreatedByUserId(), record.getVersion());
    }

    private Long internalCompanyId(UUID companyId) {
        return dsl.select(COMPANIES.ID).from(COMPANIES)
                .where(COMPANIES.PUBLIC_ID.eq(companyId)).fetchOne(COMPANIES.ID);
    }

    private CompanyMember toMember(
            com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.CompanyMembersRecord record,
            UUID companyId) {
        return new CompanyMember(record.getPublicId(), companyId, record.getUserId(), record.getRole(),
                record.getStatus(), record.getJoinedAt(), record.getVersion());
    }
}
