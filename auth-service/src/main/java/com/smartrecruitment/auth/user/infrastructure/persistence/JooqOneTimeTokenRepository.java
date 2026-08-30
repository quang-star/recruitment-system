package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.user.application.port.OneTimeTokenRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.OneTimeTokens.ONE_TIME_TOKENS;

@Repository
public class JooqOneTimeTokenRepository implements OneTimeTokenRepository {

    private static final String EMAIL_VERIFICATION = "EMAIL_VERIFICATION";
    private static final String PASSWORD_RESET = "PASSWORD_RESET";

    private final DSLContext dsl;

    public JooqOneTimeTokenRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public void insertEmailVerificationToken(Long userId, String tokenHash, Instant createdAt, Instant expiresAt) {
        dsl.insertInto(ONE_TIME_TOKENS)
                .set(ONE_TIME_TOKENS.PUBLIC_ID, UUID.randomUUID())
                .set(ONE_TIME_TOKENS.USER_ID, userId)
                .set(ONE_TIME_TOKENS.TOKEN_TYPE, EMAIL_VERIFICATION)
                .set(ONE_TIME_TOKENS.TOKEN_HASH, tokenHash)
                .set(ONE_TIME_TOKENS.EXPIRES_AT, toOffsetDateTime(expiresAt))
                .set(ONE_TIME_TOKENS.CREATED_AT, toOffsetDateTime(createdAt))
                .execute();
    }

    @Override
    public Optional<OneTimeToken> findActiveEmailVerificationToken(String tokenHash, Instant now) {
        return findActiveToken(EMAIL_VERIFICATION, tokenHash, now);
    }

    @Override
    public void insertPasswordResetToken(Long userId, String tokenHash, Instant createdAt, Instant expiresAt) {
        insertToken(userId, PASSWORD_RESET, tokenHash, createdAt, expiresAt);
    }

    @Override
    public Optional<OneTimeToken> findActivePasswordResetToken(String tokenHash, Instant now) {
        return findActiveToken(PASSWORD_RESET, tokenHash, now);
    }

    @Override
    public boolean invalidateActiveTokens(Long userId, String tokenType, Instant invalidatedAt) {
        return dsl.update(ONE_TIME_TOKENS)
                .set(ONE_TIME_TOKENS.INVALIDATED_AT, toOffsetDateTime(invalidatedAt))
                .where(ONE_TIME_TOKENS.USER_ID.eq(userId))
                .and(ONE_TIME_TOKENS.TOKEN_TYPE.eq(tokenType))
                .and(ONE_TIME_TOKENS.CONSUMED_AT.isNull())
                .and(ONE_TIME_TOKENS.INVALIDATED_AT.isNull())
                .execute() > 0;
    }

    @Override
    public boolean hasRecentlyIssuedActiveToken(Long userId, String tokenType, Instant createdAfter, Instant now) {
        return dsl.fetchExists(dsl.selectOne()
                .from(ONE_TIME_TOKENS)
                .where(ONE_TIME_TOKENS.USER_ID.eq(userId))
                .and(ONE_TIME_TOKENS.TOKEN_TYPE.eq(tokenType))
                .and(ONE_TIME_TOKENS.CREATED_AT.ge(toOffsetDateTime(createdAfter)))
                .and(ONE_TIME_TOKENS.EXPIRES_AT.gt(toOffsetDateTime(now)))
                .and(ONE_TIME_TOKENS.CONSUMED_AT.isNull())
                .and(ONE_TIME_TOKENS.INVALIDATED_AT.isNull()));
    }

    private Optional<OneTimeToken> findActiveToken(String tokenType, String tokenHash, Instant now) {
        return dsl.select(ONE_TIME_TOKENS.ID, ONE_TIME_TOKENS.USER_ID, ONE_TIME_TOKENS.EXPIRES_AT)
                .from(ONE_TIME_TOKENS)
                .where(ONE_TIME_TOKENS.TOKEN_TYPE.eq(tokenType))
                .and(ONE_TIME_TOKENS.TOKEN_HASH.eq(tokenHash))
                .and(ONE_TIME_TOKENS.CONSUMED_AT.isNull())
                .and(ONE_TIME_TOKENS.INVALIDATED_AT.isNull())
                .and(ONE_TIME_TOKENS.EXPIRES_AT.gt(toOffsetDateTime(now)))
                .fetchOptional(record -> new OneTimeToken(
                        record.get(ONE_TIME_TOKENS.ID),
                        record.get(ONE_TIME_TOKENS.USER_ID),
                        record.get(ONE_TIME_TOKENS.EXPIRES_AT).toInstant()
                ));
    }

    private void insertToken(Long userId, String tokenType, String tokenHash, Instant createdAt, Instant expiresAt) {
        dsl.insertInto(ONE_TIME_TOKENS)
                .set(ONE_TIME_TOKENS.PUBLIC_ID, UUID.randomUUID())
                .set(ONE_TIME_TOKENS.USER_ID, userId)
                .set(ONE_TIME_TOKENS.TOKEN_TYPE, tokenType)
                .set(ONE_TIME_TOKENS.TOKEN_HASH, tokenHash)
                .set(ONE_TIME_TOKENS.EXPIRES_AT, toOffsetDateTime(expiresAt))
                .set(ONE_TIME_TOKENS.CREATED_AT, toOffsetDateTime(createdAt))
                .execute();
    }

    @Override
    public boolean consume(Long id, Instant consumedAt) {
        return dsl.update(ONE_TIME_TOKENS)
                .set(ONE_TIME_TOKENS.CONSUMED_AT, toOffsetDateTime(consumedAt))
                .where(ONE_TIME_TOKENS.ID.eq(id))
                .and(ONE_TIME_TOKENS.CONSUMED_AT.isNull())
                .and(ONE_TIME_TOKENS.INVALIDATED_AT.isNull())
                .and(ONE_TIME_TOKENS.EXPIRES_AT.gt(toOffsetDateTime(consumedAt)))
                .execute() == 1;
    }

    private static OffsetDateTime toOffsetDateTime(Instant value) {
        return value.atOffset(ZoneOffset.UTC);
    }
}
