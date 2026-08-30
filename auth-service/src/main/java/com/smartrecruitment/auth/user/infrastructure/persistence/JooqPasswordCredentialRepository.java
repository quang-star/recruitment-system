package com.smartrecruitment.auth.user.infrastructure.persistence;
import com.smartrecruitment.auth.user.application.port.PasswordCredentialRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.PasswordCredentials.PASSWORD_CREDENTIALS;
@Repository
public class JooqPasswordCredentialRepository implements PasswordCredentialRepository {
    private final DSLContext dsl;
    public JooqPasswordCredentialRepository(DSLContext dsl) { this.dsl = dsl; }
    @Override
    public Optional<PasswordCredential> findByUserId(Long userId) {
        return dsl.selectFrom(PASSWORD_CREDENTIALS).where(PASSWORD_CREDENTIALS.USER_ID.eq(userId))
                .fetchOptional(record -> new PasswordCredential(record.get(PASSWORD_CREDENTIALS.PASSWORD_HASH),
                        toInstant(record.get(PASSWORD_CREDENTIALS.LOCKED_UNTIL)),
                        record.get(PASSWORD_CREDENTIALS.MUST_CHANGE_PASSWORD)));
    }
    @Override
    public void insert(Long userId, String passwordHash, Instant createdAt) {
        OffsetDateTime timestamp = createdAt.atOffset(ZoneOffset.UTC);
        dsl.insertInto(PASSWORD_CREDENTIALS)
                .set(PASSWORD_CREDENTIALS.USER_ID, userId)
                .set(PASSWORD_CREDENTIALS.PASSWORD_HASH, passwordHash)
                .set(PASSWORD_CREDENTIALS.HASH_ALGORITHM, "BCRYPT")
                .set(PASSWORD_CREDENTIALS.PASSWORD_CHANGED_AT, timestamp)
                .set(PASSWORD_CREDENTIALS.CREATED_AT, timestamp)
                .set(PASSWORD_CREDENTIALS.UPDATED_AT, timestamp)
                .set(PASSWORD_CREDENTIALS.VERSION, 0L).execute();
    }
    @Override
    public boolean updatePassword(Long userId, String passwordHash, Instant changedAt) {
        OffsetDateTime timestamp = changedAt.atOffset(ZoneOffset.UTC);
        return dsl.update(PASSWORD_CREDENTIALS)
                .set(PASSWORD_CREDENTIALS.PASSWORD_HASH, passwordHash)
                .set(PASSWORD_CREDENTIALS.HASH_ALGORITHM, "BCRYPT")
                .set(PASSWORD_CREDENTIALS.PASSWORD_CHANGED_AT, timestamp)
                .set(PASSWORD_CREDENTIALS.FAILED_ATTEMPT_COUNT, 0)
                .setNull(PASSWORD_CREDENTIALS.LAST_FAILED_AT)
                .setNull(PASSWORD_CREDENTIALS.LOCKED_UNTIL)
                .set(PASSWORD_CREDENTIALS.MUST_CHANGE_PASSWORD, false)
                .set(PASSWORD_CREDENTIALS.UPDATED_AT, timestamp)
                .set(PASSWORD_CREDENTIALS.VERSION, PASSWORD_CREDENTIALS.VERSION.plus(1L))
                .where(PASSWORD_CREDENTIALS.USER_ID.eq(userId))
                .execute() == 1;
    }
    private static Instant toInstant(OffsetDateTime value) { return value == null ? null : value.toInstant(); }
}
