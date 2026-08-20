package com.smartrecruitment.core.candidate.infrastructure.persistence;

import com.smartrecruitment.core.candidate.application.port.CandidateProfileRepository;
import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CandidateProfiles.CANDIDATE_PROFILES;

@Repository
public class JooqCandidateProfileRepository implements CandidateProfileRepository {
    private final DSLContext dsl;

    public JooqCandidateProfileRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public Optional<CandidateProfile> findByUserId(UUID userId) {
        return dsl.selectFrom(CANDIDATE_PROFILES)
                .where(CANDIDATE_PROFILES.USER_ID.eq(userId))
                .fetchOptional(this::toDomain);
    }

    @Override
    public CandidateProfile insert(CandidateProfile profile) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        var record = dsl.insertInto(CANDIDATE_PROFILES)
                .set(CANDIDATE_PROFILES.PUBLIC_ID, profile.publicId())
                .set(CANDIDATE_PROFILES.USER_ID, profile.userId())
                .set(CANDIDATE_PROFILES.DISPLAY_NAME, profile.displayName())
                .set(CANDIDATE_PROFILES.HEADLINE, profile.headline())
                .set(CANDIDATE_PROFILES.LOCATION_TEXT, profile.locationText())
                .set(CANDIDATE_PROFILES.VISIBILITY, profile.visibility().name())
                .set(CANDIDATE_PROFILES.CREATED_AT, now)
                .set(CANDIDATE_PROFILES.UPDATED_AT, now)
                .set(CANDIDATE_PROFILES.VERSION, 0L)
                .returning()
                .fetchOne();
        if (record == null) throw new IllegalStateException("Insert candidate profile returned no record");
        return toDomain(record);
    }

    @Override
    public Optional<CandidateProfile> update(CandidateProfile profile, long expectedVersion) {
        return dsl.update(CANDIDATE_PROFILES)
                .set(CANDIDATE_PROFILES.DISPLAY_NAME, profile.displayName())
                .set(CANDIDATE_PROFILES.HEADLINE, profile.headline())
                .set(CANDIDATE_PROFILES.LOCATION_TEXT, profile.locationText())
                .set(CANDIDATE_PROFILES.VISIBILITY, profile.visibility().name())
                .set(CANDIDATE_PROFILES.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(CANDIDATE_PROFILES.VERSION, CANDIDATE_PROFILES.VERSION.plus(1L))
                .where(CANDIDATE_PROFILES.USER_ID.eq(profile.userId()))
                .and(CANDIDATE_PROFILES.VERSION.eq(expectedVersion))
                .returning()
                .fetchOptional()
                .map(this::toDomain);
    }

    private CandidateProfile toDomain(
            com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.CandidateProfilesRecord record) {
        return new CandidateProfile(record.getPublicId(), record.getUserId(), record.getDisplayName(),
                record.getHeadline(), record.getLocationText(),
                ProfileVisibility.valueOf(record.getVisibility()), record.getVersion());
    }
}
