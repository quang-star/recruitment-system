package com.smartrecruitment.auth.database;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import com.smartrecruitment.auth.user.application.port.AuthUserRepository;
import com.smartrecruitment.auth.user.domain.AuthUser;
import org.jooq.DSLContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.IdempotencyRecords.IDEMPOTENCY_RECORDS;
import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.OneTimeTokens.ONE_TIME_TOKENS;
import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.Roles.ROLES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
@Transactional
class AuthDatabaseSchemaTests {

    @Autowired
    private DSLContext dsl;

    @Autowired
    private AuthUserRepository users;

    @Test
    void seedsOnlyTheThreeGlobalSystemRoles() {
        assertThat(dsl.select(ROLES.CODE)
                .from(ROLES)
                .where(ROLES.SYSTEM_ROLE.isTrue())
                .fetchSet(ROLES.CODE))
                .containsExactlyInAnyOrder("CANDIDATE", "RECRUITER", "SYSTEM_ADMIN");
    }

    @Test
    void allowsOnlyOneUnconsumedTokenPerUserAndPurpose() {
        AuthUser user = users.insert(AuthUser.pending("one-time-token@example.com"));
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        insertOneTimeToken(UUID.randomUUID(), user.id(), tokenDigest((byte) 1), now);

        assertThatThrownBy(() ->
                insertOneTimeToken(UUID.randomUUID(), user.id(), tokenDigest((byte) 2), now))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void enforcesUniqueIdempotencyKeyWithinOperation() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        insertIdempotencyRecord(
                UUID.randomUUID(), "REGISTER", tokenDigest((byte) 5), digest((byte) 3), now);

        assertThatThrownBy(() -> insertIdempotencyRecord(
                UUID.randomUUID(), "REGISTER", tokenDigest((byte) 5), digest((byte) 4), now))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void allowsTheSameIdempotencyKeyForDifferentOperations() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        String keyHash = tokenDigest((byte) 6);

        insertIdempotencyRecord(
                UUID.randomUUID(), "REGISTER", keyHash, digest((byte) 3), now);
        insertIdempotencyRecord(
                UUID.randomUUID(), "RESEND_VERIFICATION", keyHash, digest((byte) 4), now);

        assertThat(dsl.fetchCount(
                IDEMPOTENCY_RECORDS,
                IDEMPOTENCY_RECORDS.KEY_HASH.eq(keyHash)))
                .isEqualTo(2);
    }

    private void insertOneTimeToken(
            UUID id,
            Long userId,
            String tokenHash,
            OffsetDateTime now
    ) {
        dsl.insertInto(ONE_TIME_TOKENS)
                .set(ONE_TIME_TOKENS.PUBLIC_ID, id)
                .set(ONE_TIME_TOKENS.USER_ID, userId)
                .set(ONE_TIME_TOKENS.TOKEN_TYPE, "EMAIL_VERIFICATION")
                .set(ONE_TIME_TOKENS.TOKEN_HASH, tokenHash)
                .set(ONE_TIME_TOKENS.EXPIRES_AT, now.plusMinutes(15))
                .set(ONE_TIME_TOKENS.CREATED_AT, now)
                .execute();
    }

    private void insertIdempotencyRecord(
            UUID id,
            String operation,
            String keyHash,
            byte[] requestHash,
            OffsetDateTime now
    ) {
        dsl.insertInto(IDEMPOTENCY_RECORDS)
                .set(IDEMPOTENCY_RECORDS.PUBLIC_ID, id)
                .set(IDEMPOTENCY_RECORDS.KEY_HASH, keyHash)
                .set(IDEMPOTENCY_RECORDS.OPERATION, operation)
                .set(IDEMPOTENCY_RECORDS.REQUEST_HASH, requestHash)
                .set(IDEMPOTENCY_RECORDS.STATE, "PROCESSING")
                .set(IDEMPOTENCY_RECORDS.LOCKED_UNTIL, now.plusMinutes(1))
                .set(IDEMPOTENCY_RECORDS.EXPIRES_AT, now.plusHours(24))
                .set(IDEMPOTENCY_RECORDS.CREATED_AT, now)
                .set(IDEMPOTENCY_RECORDS.UPDATED_AT, now)
                .execute();
    }

    private static String tokenDigest(byte value) {
        return String.format("%02x", value).repeat(32);
    }

    private static byte[] digest(byte value) {
        byte[] digest = new byte[32];
        java.util.Arrays.fill(digest, value);
        return digest;
    }
}
