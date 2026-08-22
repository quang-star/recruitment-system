package com.smartrecruitment.core.recruiter.infrastructure.persistence;

import com.smartrecruitment.core.recruiter.application.port.RecruiterProfileRepository;
import com.smartrecruitment.core.recruiter.domain.RecruiterProfile;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.RecruiterProfiles.RECRUITER_PROFILES;

@Repository
public class JooqRecruiterProfileRepository implements RecruiterProfileRepository {
    private final DSLContext dsl;

    public JooqRecruiterProfileRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public Optional<RecruiterProfile> findByUserId(UUID userId) {
        return dsl.selectFrom(RECRUITER_PROFILES)
                .where(RECRUITER_PROFILES.USER_ID.eq(userId))
                .and(RECRUITER_PROFILES.DELETED_AT.isNull())
                .fetchOptional(this::toDomain);
    }

    @Override
    public RecruiterProfile insert(RecruiterProfile profile) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        var record = dsl.insertInto(RECRUITER_PROFILES)
                .set(RECRUITER_PROFILES.PUBLIC_ID, profile.publicId())
                .set(RECRUITER_PROFILES.USER_ID, profile.userId())
                .set(RECRUITER_PROFILES.DISPLAY_NAME, profile.displayName())
                .set(RECRUITER_PROFILES.BUSINESS_TITLE, profile.businessTitle())
                .set(RECRUITER_PROFILES.BUSINESS_PHONE, profile.businessPhone())
                .set(RECRUITER_PROFILES.CREATED_AT, now)
                .set(RECRUITER_PROFILES.UPDATED_AT, now)
                .set(RECRUITER_PROFILES.VERSION, 0L)
                .returning()
                .fetchOne();
        if (record == null) throw new IllegalStateException("Insert recruiter profile returned no record");
        return toDomain(record);
    }

    @Override
    public Optional<RecruiterProfile> update(RecruiterProfile profile, long expectedVersion) {
        return dsl.update(RECRUITER_PROFILES)
                .set(RECRUITER_PROFILES.DISPLAY_NAME, profile.displayName())
                .set(RECRUITER_PROFILES.BUSINESS_TITLE, profile.businessTitle())
                .set(RECRUITER_PROFILES.BUSINESS_PHONE, profile.businessPhone())
                .set(RECRUITER_PROFILES.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(RECRUITER_PROFILES.VERSION, RECRUITER_PROFILES.VERSION.plus(1L))
                .where(RECRUITER_PROFILES.USER_ID.eq(profile.userId()))
                .and(RECRUITER_PROFILES.VERSION.eq(expectedVersion))
                .and(RECRUITER_PROFILES.DELETED_AT.isNull())
                .returning()
                .fetchOptional()
                .map(this::toDomain);
    }

    private RecruiterProfile toDomain(
            com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.RecruiterProfilesRecord record) {
        return new RecruiterProfile(record.getPublicId(), record.getUserId(), record.getDisplayName(),
                record.getBusinessTitle(), record.getBusinessPhone(), record.getVersion());
    }
}
