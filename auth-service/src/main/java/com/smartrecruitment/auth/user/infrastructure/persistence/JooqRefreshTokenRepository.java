package com.smartrecruitment.auth.user.infrastructure.persistence;
import com.smartrecruitment.auth.user.application.port.RefreshTokenRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.AuthSessions.AUTH_SESSIONS;
import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.RefreshTokens.REFRESH_TOKENS;
@Repository
public class JooqRefreshTokenRepository implements RefreshTokenRepository {
    private final DSLContext dsl;
    public JooqRefreshTokenRepository(DSLContext dsl) { this.dsl = dsl; }
    @Override
    public RefreshToken insert(Long sessionId, String tokenHash, Long parentTokenId, Instant issuedAt, Instant expiresAt) {
        var record = dsl.insertInto(REFRESH_TOKENS).set(REFRESH_TOKENS.PUBLIC_ID, UUID.randomUUID())
                .set(REFRESH_TOKENS.SESSION_ID, sessionId).set(REFRESH_TOKENS.TOKEN_HASH, tokenHash)
                .set(REFRESH_TOKENS.PARENT_TOKEN_ID, parentTokenId).set(REFRESH_TOKENS.ISSUED_AT, utc(issuedAt))
                .set(REFRESH_TOKENS.EXPIRES_AT, utc(expiresAt)).returning().fetchOne();
        if (record == null) throw new IllegalStateException("Insert refresh token returned no record");
        return new RefreshToken(record.getId(), record.getPublicId(), record.getSessionId(), null, record.getTokenHash(),
                record.getExpiresAt().toInstant(), instant(record.getUsedAt()), instant(record.getRevokedAt()), null);
    }
    @Override
    public Optional<RefreshToken> findByHash(String tokenHash) {
        return dsl.select(REFRESH_TOKENS.fields()).select(AUTH_SESSIONS.USER_ID, AUTH_SESSIONS.REVOKED_AT)
                .from(REFRESH_TOKENS).join(AUTH_SESSIONS).on(AUTH_SESSIONS.ID.eq(REFRESH_TOKENS.SESSION_ID))
                .where(REFRESH_TOKENS.TOKEN_HASH.eq(tokenHash))
                .fetchOptional(record -> new RefreshToken(record.get(REFRESH_TOKENS.ID), record.get(REFRESH_TOKENS.PUBLIC_ID),
                        record.get(REFRESH_TOKENS.SESSION_ID), record.get(AUTH_SESSIONS.USER_ID), record.get(REFRESH_TOKENS.TOKEN_HASH),
                        record.get(REFRESH_TOKENS.EXPIRES_AT).toInstant(), instant(record.get(REFRESH_TOKENS.USED_AT)),
                        instant(record.get(REFRESH_TOKENS.REVOKED_AT)), instant(record.get(AUTH_SESSIONS.REVOKED_AT))));
    }
    @Override
    public boolean markUsedAndReplaced(Long id, Instant usedAt, Long replacementId) {
        return dsl.update(REFRESH_TOKENS).set(REFRESH_TOKENS.USED_AT, utc(usedAt))
                .set(REFRESH_TOKENS.REPLACED_BY_TOKEN_ID, replacementId).where(REFRESH_TOKENS.ID.eq(id))
                .and(REFRESH_TOKENS.USED_AT.isNull()).and(REFRESH_TOKENS.REVOKED_AT.isNull()).execute() == 1;
    }
    private static OffsetDateTime utc(Instant value) { return value.atOffset(ZoneOffset.UTC); }
    private static Instant instant(OffsetDateTime value) { return value == null ? null : value.toInstant(); }
}
