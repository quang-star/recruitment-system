package com.smartrecruitment.auth.user.infrastructure.persistence;
import com.smartrecruitment.auth.infrastructure.jooq.generated.tables.records.AuthUsersRecord;
import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.user.domain.UserStatus;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.AuthUsers.AUTH_USERS;
@Repository
public class JooqAuthUserRepository implements AuthUserRepository {
    private final DSLContext dsl;
    public JooqAuthUserRepository(DSLContext dsl) { this.dsl = dsl; }
    @Override
    public AuthUser insert(AuthUser user) {
        AuthUsersRecord savedRecord = dsl.insertInto(AUTH_USERS)
                .set(AUTH_USERS.PUBLIC_ID, user.publicId()).set(AUTH_USERS.EMAIL, user.email())
                .set(AUTH_USERS.NORMALIZED_EMAIL, user.normalizedEmail()).set(AUTH_USERS.STATUS, user.status().name())
                .set(AUTH_USERS.EMAIL_VERIFIED_AT, utc(user.emailVerifiedAt())).set(AUTH_USERS.LAST_LOGIN_AT, utc(user.lastLoginAt()))
                .set(AUTH_USERS.CREATED_AT, utc(user.createdAt())).set(AUTH_USERS.UPDATED_AT, utc(user.updatedAt()))
                .set(AUTH_USERS.VERSION, user.version()).returning().fetchOne();
        if (savedRecord == null) throw new IllegalStateException("Insert auth user returned no record");
        return toDomain(savedRecord);
    }
    @Override
    public Optional<AuthUser> findByNormalizedEmail(String normalizedEmail) {
        return dsl.selectFrom(AUTH_USERS).where(AUTH_USERS.NORMALIZED_EMAIL.eq(normalizedEmail)).fetchOptional(this::toDomain);
    }
    @Override
    public Optional<AuthUser> findByPublicId(UUID publicId) {
        return dsl.selectFrom(AUTH_USERS).where(AUTH_USERS.PUBLIC_ID.eq(publicId)).fetchOptional(this::toDomain);
    }
    @Override
    public Optional<AuthUser> findById(Long id) {
        return dsl.selectFrom(AUTH_USERS).where(AUTH_USERS.ID.eq(id)).fetchOptional(this::toDomain);
    }
    @Override
    public boolean existsByNormalizedEmail(String normalizedEmail) {
        return dsl.fetchExists(dsl.selectOne().from(AUTH_USERS).where(AUTH_USERS.NORMALIZED_EMAIL.eq(normalizedEmail)));
    }
    @Override
    public Optional<AuthUser> activateById(Long id, Instant verifiedAt) {
        return dsl.update(AUTH_USERS).set(AUTH_USERS.STATUS, UserStatus.ACTIVE.name())
                .set(AUTH_USERS.EMAIL_VERIFIED_AT, utc(verifiedAt)).set(AUTH_USERS.UPDATED_AT, utc(verifiedAt))
                .set(AUTH_USERS.VERSION, AUTH_USERS.VERSION.plus(1L)).where(AUTH_USERS.ID.eq(id))
                .and(AUTH_USERS.STATUS.eq(UserStatus.PENDING.name())).returning().fetchOptional(this::toDomain);
    }
    @Override
    public Optional<AuthUser> updateLastLogin(Long id, Instant lastLoginAt) {
        return dsl.update(AUTH_USERS).set(AUTH_USERS.LAST_LOGIN_AT, utc(lastLoginAt))
                .set(AUTH_USERS.UPDATED_AT, utc(lastLoginAt)).set(AUTH_USERS.VERSION, AUTH_USERS.VERSION.plus(1L))
                .where(AUTH_USERS.ID.eq(id)).and(AUTH_USERS.STATUS.eq(UserStatus.ACTIVE.name()))
                .returning().fetchOptional(this::toDomain);
    }
    private AuthUser toDomain(AuthUsersRecord record) {
        return new AuthUser(record.getId(), record.getPublicId(), record.getEmail(), record.getNormalizedEmail(),
                UserStatus.valueOf(record.getStatus()), instant(record.getEmailVerifiedAt()), instant(record.getLastLoginAt()),
                instant(record.getCreatedAt()), instant(record.getUpdatedAt()), record.getVersion());
    }
    private static OffsetDateTime utc(Instant value) { return value == null ? null : value.atOffset(ZoneOffset.UTC); }
    private static Instant instant(OffsetDateTime value) { return value == null ? null : value.toInstant(); }
}
