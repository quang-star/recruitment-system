package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.user.application.port.SessionRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.List;
import java.util.UUID;

import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.AuthSessions.AUTH_SESSIONS;

@Repository
public class JooqSessionRepository implements SessionRepository {
    private final DSLContext dsl;
    public JooqSessionRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Session insert(Long userId, String clientType, String deviceName, String userAgent, String createdIp,
                          Instant authenticatedAt, Instant idleExpiresAt, Instant absoluteExpiresAt) {
        var record = dsl.insertInto(AUTH_SESSIONS)
                .set(AUTH_SESSIONS.PUBLIC_ID, UUID.randomUUID())
                .set(AUTH_SESSIONS.USER_ID, userId)
                .set(AUTH_SESSIONS.CLIENT_TYPE, clientType)
                .set(AUTH_SESSIONS.DEVICE_NAME, deviceName)
                .set(AUTH_SESSIONS.USER_AGENT, userAgent)
                .set(AUTH_SESSIONS.CREATED_IP, createdIp)
                .set(AUTH_SESSIONS.LAST_SEEN_IP, createdIp)
                .set(AUTH_SESSIONS.AUTHENTICATED_AT, utc(authenticatedAt))
                .set(AUTH_SESSIONS.LAST_SEEN_AT, utc(authenticatedAt))
                .set(AUTH_SESSIONS.IDLE_EXPIRES_AT, utc(idleExpiresAt))
                .set(AUTH_SESSIONS.ABSOLUTE_EXPIRES_AT, utc(absoluteExpiresAt))
                .set(AUTH_SESSIONS.VERSION, 0L)
                .returning().fetchOne();
        if (record == null) throw new IllegalStateException("Insert auth session returned no record");
        return toDomain(record);
    }

    @Override
    public Optional<Session> findById(Long id) {
        return dsl.selectFrom(AUTH_SESSIONS)
                .where(AUTH_SESSIONS.ID.eq(id))
                .fetchOptional(record -> toDomain(record));
    }

    @Override
    public boolean touch(Long id, String lastSeenIp, Instant lastSeenAt, Instant idleExpiresAt) {
        return dsl.update(AUTH_SESSIONS)
                .set(AUTH_SESSIONS.LAST_SEEN_IP, lastSeenIp)
                .set(AUTH_SESSIONS.LAST_SEEN_AT, utc(lastSeenAt))
                .set(AUTH_SESSIONS.IDLE_EXPIRES_AT, utc(idleExpiresAt))
                .set(AUTH_SESSIONS.VERSION, AUTH_SESSIONS.VERSION.plus(1L))
                .where(AUTH_SESSIONS.ID.eq(id))
                .and(AUTH_SESSIONS.REVOKED_AT.isNull())
                .and(AUTH_SESSIONS.ABSOLUTE_EXPIRES_AT.gt(utc(lastSeenAt)))
                .execute() == 1;
    }

    @Override
    public boolean revoke(Long id, String reason, Instant revokedAt) {
        return dsl.update(AUTH_SESSIONS)
                .set(AUTH_SESSIONS.REVOKED_AT, utc(revokedAt))
                .set(AUTH_SESSIONS.REVOKE_REASON, reason)
                .set(AUTH_SESSIONS.VERSION, AUTH_SESSIONS.VERSION.plus(1L))
                .where(AUTH_SESSIONS.ID.eq(id))
                .and(AUTH_SESSIONS.REVOKED_AT.isNull())
                .execute() == 1;
    }

    @Override
    public int revokeAllByUserId(Long userId, String reason, Instant revokedAt) {
        return dsl.update(AUTH_SESSIONS)
                .set(AUTH_SESSIONS.REVOKED_AT, utc(revokedAt))
                .set(AUTH_SESSIONS.REVOKE_REASON, reason)
                .set(AUTH_SESSIONS.VERSION, AUTH_SESSIONS.VERSION.plus(1L))
                .where(AUTH_SESSIONS.USER_ID.eq(userId))
                .and(AUTH_SESSIONS.REVOKED_AT.isNull())
                .execute();
    }

    @Override
    public boolean revokeByPublicIdAndUserId(UUID publicId, Long userId, String reason, Instant revokedAt) {
        return dsl.update(AUTH_SESSIONS)
                .set(AUTH_SESSIONS.REVOKED_AT, utc(revokedAt))
                .set(AUTH_SESSIONS.REVOKE_REASON, reason)
                .set(AUTH_SESSIONS.VERSION, AUTH_SESSIONS.VERSION.plus(1L))
                .where(AUTH_SESSIONS.PUBLIC_ID.eq(publicId))
                .and(AUTH_SESSIONS.USER_ID.eq(userId))
                .and(AUTH_SESSIONS.REVOKED_AT.isNull())
                .execute() == 1;
    }

    @Override
    public List<SessionDetails> findAllByUserId(Long userId) {
        return dsl.selectFrom(AUTH_SESSIONS)
                .where(AUTH_SESSIONS.USER_ID.eq(userId))
                .orderBy(AUTH_SESSIONS.LAST_SEEN_AT.desc())
                .fetch(record -> new SessionDetails(
                        record.getPublicId(), record.getClientType(), record.getDeviceName(), record.getUserAgent(),
                        record.getCreatedIp(), record.getLastSeenIp(), record.getAuthenticatedAt().toInstant(),
                        record.getLastSeenAt().toInstant(), record.getIdleExpiresAt().toInstant(),
                        record.getAbsoluteExpiresAt().toInstant(),
                        record.getRevokedAt() == null ? null : record.getRevokedAt().toInstant(),
                        record.getRevokeReason()));
    }

    private static Session toDomain(com.smartrecruitment.auth.infrastructure.jooq.generated.tables.records.AuthSessionsRecord record) {
        return new Session(record.getId(), record.getPublicId(), record.getUserId(),
                record.getIdleExpiresAt().toInstant(), record.getAbsoluteExpiresAt().toInstant(),
                record.getRevokedAt() == null ? null : record.getRevokedAt().toInstant());
    }
    private static OffsetDateTime utc(Instant value) { return value.atOffset(ZoneOffset.UTC); }
}

