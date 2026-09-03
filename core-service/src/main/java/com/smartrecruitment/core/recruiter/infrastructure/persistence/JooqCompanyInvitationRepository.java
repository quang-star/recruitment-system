package com.smartrecruitment.core.recruiter.infrastructure.persistence;

import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationRepository;
import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyInvitations.COMPANY_INVITATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;

@Repository
public class JooqCompanyInvitationRepository implements CompanyInvitationRepository {
    private final DSLContext dsl;

    public JooqCompanyInvitationRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public CompanyInvitation insert(CompanyInvitation invitation) {
        Long companyId = internalCompanyId(invitation.companyId());
        if (companyId == null) throw new IllegalStateException("Company disappeared while creating invitation");
        var record = dsl.insertInto(COMPANY_INVITATIONS)
                .set(COMPANY_INVITATIONS.PUBLIC_ID, invitation.publicId())
                .set(COMPANY_INVITATIONS.COMPANY_ID, companyId)
                .set(COMPANY_INVITATIONS.EMAIL, invitation.email())
                .set(COMPANY_INVITATIONS.NORMALIZED_EMAIL, invitation.normalizedEmail())
                .set(COMPANY_INVITATIONS.ROLE, invitation.role())
                .set(COMPANY_INVITATIONS.TOKEN_HASH, invitation.tokenHash())
                .set(COMPANY_INVITATIONS.INVITED_BY_USER_ID, invitation.invitedByUserId())
                .set(COMPANY_INVITATIONS.EXPIRES_AT, invitation.expiresAt())
                .set(COMPANY_INVITATIONS.CREATED_AT, invitation.createdAt())
                .set(COMPANY_INVITATIONS.UPDATED_AT, invitation.createdAt())
                .set(COMPANY_INVITATIONS.VERSION, 0L)
                .returning()
                .fetchOne();
        if (record == null) throw new IllegalStateException("Insert invitation returned no record");
        return toInvitation(record, invitation.companyId());
    }

    @Override
    public List<CompanyInvitation> findAll(UUID companyId) {
        Long internalCompanyId = internalCompanyId(companyId);
        if (internalCompanyId == null) return List.of();
        return dsl.selectFrom(COMPANY_INVITATIONS)
                .where(COMPANY_INVITATIONS.COMPANY_ID.eq(internalCompanyId))
                .orderBy(COMPANY_INVITATIONS.CREATED_AT.desc())
                .fetch(record -> toInvitation(record, companyId));
    }

    @Override
    public Optional<CompanyInvitation> findActive(UUID companyId, String normalizedEmail, OffsetDateTime now) {
        Long internalCompanyId = internalCompanyId(companyId);
        if (internalCompanyId == null) return Optional.empty();
        return dsl.selectFrom(COMPANY_INVITATIONS)
                .where(COMPANY_INVITATIONS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_INVITATIONS.NORMALIZED_EMAIL.eq(normalizedEmail))
                .and(COMPANY_INVITATIONS.ACCEPTED_AT.isNull())
                .and(COMPANY_INVITATIONS.REVOKED_AT.isNull())
                .and(COMPANY_INVITATIONS.EXPIRES_AT.gt(now))
                .fetchOptional(record -> toInvitation(record, companyId));
    }

    @Override
    public Optional<CompanyInvitation> findActiveByTokenHash(String tokenHash, OffsetDateTime now) {
        return dsl.select(COMPANY_INVITATIONS.fields())
                .select(COMPANIES.PUBLIC_ID)
                .from(COMPANY_INVITATIONS)
                .join(COMPANIES).on(COMPANIES.ID.eq(COMPANY_INVITATIONS.COMPANY_ID))
                .where(COMPANY_INVITATIONS.TOKEN_HASH.eq(tokenHash))
                .and(COMPANY_INVITATIONS.ACCEPTED_AT.isNull())
                .and(COMPANY_INVITATIONS.REVOKED_AT.isNull())
                .and(COMPANY_INVITATIONS.EXPIRES_AT.gt(now))
                .fetchOptional(this::toInvitationWithCompany);
    }

    @Override
    public int revokeExpired(UUID companyId, String normalizedEmail, OffsetDateTime now) {
        Long internalCompanyId = internalCompanyId(companyId);
        if (internalCompanyId == null) return 0;
        return dsl.update(COMPANY_INVITATIONS)
                .set(COMPANY_INVITATIONS.REVOKED_AT, now)
                .set(COMPANY_INVITATIONS.UPDATED_AT, now)
                .set(COMPANY_INVITATIONS.VERSION, COMPANY_INVITATIONS.VERSION.plus(1L))
                .where(COMPANY_INVITATIONS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_INVITATIONS.NORMALIZED_EMAIL.eq(normalizedEmail))
                .and(COMPANY_INVITATIONS.ACCEPTED_AT.isNull())
                .and(COMPANY_INVITATIONS.REVOKED_AT.isNull())
                .and(COMPANY_INVITATIONS.EXPIRES_AT.le(now))
                .execute();
    }

    @Override
    public boolean revoke(UUID companyId, UUID invitationId, long expectedVersion, OffsetDateTime now) {
        Long internalCompanyId = internalCompanyId(companyId);
        if (internalCompanyId == null) return false;
        return dsl.update(COMPANY_INVITATIONS)
                .set(COMPANY_INVITATIONS.REVOKED_AT, now)
                .set(COMPANY_INVITATIONS.UPDATED_AT, now)
                .set(COMPANY_INVITATIONS.VERSION, COMPANY_INVITATIONS.VERSION.plus(1L))
                .where(COMPANY_INVITATIONS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_INVITATIONS.PUBLIC_ID.eq(invitationId))
                .and(COMPANY_INVITATIONS.VERSION.eq(expectedVersion))
                .and(COMPANY_INVITATIONS.ACCEPTED_AT.isNull())
                .and(COMPANY_INVITATIONS.REVOKED_AT.isNull())
                .and(COMPANY_INVITATIONS.EXPIRES_AT.gt(now))
                .execute() == 1;
    }

    @Override
    public Optional<CompanyMember> accept(CompanyInvitation invitation, UUID userId, OffsetDateTime now) {
        Long internalCompanyId = internalCompanyId(invitation.companyId());
        if (internalCompanyId == null) return Optional.empty();
        var existingMember = dsl.selectFrom(COMPANY_MEMBERS)
                .where(COMPANY_MEMBERS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .forUpdate()
                .fetchOne();
        if (existingMember != null && !"LEFT".equals(existingMember.getStatus())) return Optional.empty();

        var accepted = dsl.update(COMPANY_INVITATIONS)
                .set(COMPANY_INVITATIONS.ACCEPTED_BY_USER_ID, userId)
                .set(COMPANY_INVITATIONS.ACCEPTED_AT, now)
                .set(COMPANY_INVITATIONS.UPDATED_AT, now)
                .set(COMPANY_INVITATIONS.VERSION, COMPANY_INVITATIONS.VERSION.plus(1L))
                .where(COMPANY_INVITATIONS.COMPANY_ID.eq(internalCompanyId))
                .and(COMPANY_INVITATIONS.PUBLIC_ID.eq(invitation.publicId()))
                .and(COMPANY_INVITATIONS.VERSION.eq(invitation.version()))
                .and(COMPANY_INVITATIONS.ACCEPTED_AT.isNull())
                .and(COMPANY_INVITATIONS.REVOKED_AT.isNull())
                .and(COMPANY_INVITATIONS.EXPIRES_AT.gt(now))
                .returning()
                .fetchOne();
        if (accepted == null) return Optional.empty();

        if (existingMember == null) {
            var inserted = dsl.insertInto(COMPANY_MEMBERS)
                    .set(COMPANY_MEMBERS.PUBLIC_ID, UUID.randomUUID())
                    .set(COMPANY_MEMBERS.COMPANY_ID, internalCompanyId)
                    .set(COMPANY_MEMBERS.USER_ID, userId)
                    .set(COMPANY_MEMBERS.ROLE, invitation.role())
                    .set(COMPANY_MEMBERS.STATUS, "ACTIVE")
                    .set(COMPANY_MEMBERS.INVITED_BY_USER_ID, invitation.invitedByUserId())
                    .set(COMPANY_MEMBERS.JOINED_AT, now)
                    .set(COMPANY_MEMBERS.CREATED_AT, now)
                    .set(COMPANY_MEMBERS.UPDATED_AT, now)
                    .set(COMPANY_MEMBERS.VERSION, 0L)
                    .returning()
                    .fetchOne();
            return Optional.of(toMember(inserted, invitation.companyId()));
        }
        var reactivated = dsl.update(COMPANY_MEMBERS)
                .set(COMPANY_MEMBERS.ROLE, invitation.role())
                .set(COMPANY_MEMBERS.STATUS, "ACTIVE")
                .set(COMPANY_MEMBERS.INVITED_BY_USER_ID, invitation.invitedByUserId())
                .set(COMPANY_MEMBERS.JOINED_AT, now)
                .setNull(COMPANY_MEMBERS.LEFT_AT)
                .set(COMPANY_MEMBERS.UPDATED_AT, now)
                .set(COMPANY_MEMBERS.VERSION, COMPANY_MEMBERS.VERSION.plus(1L))
                .where(COMPANY_MEMBERS.ID.eq(existingMember.getId()))
                .and(COMPANY_MEMBERS.STATUS.eq("LEFT"))
                .returning()
                .fetchOne();
        return reactivated == null ? Optional.empty() : Optional.of(toMember(reactivated, invitation.companyId()));
    }

    private Long internalCompanyId(UUID companyId) {
        return dsl.select(COMPANIES.ID).from(COMPANIES)
                .where(COMPANIES.PUBLIC_ID.eq(companyId)).fetchOne(COMPANIES.ID);
    }

    private CompanyInvitation toInvitationWithCompany(Record record) {
        return toInvitation(record, record.get(COMPANIES.PUBLIC_ID));
    }

    private CompanyInvitation toInvitation(Record record, UUID companyId) {
        return new CompanyInvitation(record.get(COMPANY_INVITATIONS.PUBLIC_ID), companyId,
                record.get(COMPANY_INVITATIONS.EMAIL), record.get(COMPANY_INVITATIONS.NORMALIZED_EMAIL),
                record.get(COMPANY_INVITATIONS.ROLE), record.get(COMPANY_INVITATIONS.TOKEN_HASH),
                record.get(COMPANY_INVITATIONS.INVITED_BY_USER_ID), record.get(COMPANY_INVITATIONS.EXPIRES_AT),
                record.get(COMPANY_INVITATIONS.ACCEPTED_BY_USER_ID), record.get(COMPANY_INVITATIONS.ACCEPTED_AT),
                record.get(COMPANY_INVITATIONS.REVOKED_AT), record.get(COMPANY_INVITATIONS.CREATED_AT),
                record.get(COMPANY_INVITATIONS.VERSION));
    }

    private CompanyMember toMember(Record record, UUID companyId) {
        return new CompanyMember(record.get(COMPANY_MEMBERS.PUBLIC_ID), companyId,
                record.get(COMPANY_MEMBERS.USER_ID), record.get(COMPANY_MEMBERS.ROLE),
                record.get(COMPANY_MEMBERS.STATUS), record.get(COMPANY_MEMBERS.JOINED_AT),
                record.get(COMPANY_MEMBERS.VERSION));
    }
}

