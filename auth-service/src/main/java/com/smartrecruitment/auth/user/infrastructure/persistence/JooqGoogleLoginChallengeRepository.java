package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.user.application.port.GoogleLoginChallengeRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.ZoneOffset;

import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.GoogleLoginChallenges.GOOGLE_LOGIN_CHALLENGES;

@Repository
public class JooqGoogleLoginChallengeRepository implements GoogleLoginChallengeRepository {
    private final DSLContext dsl;

    public JooqGoogleLoginChallengeRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public void insert(String nonceHash, Instant expiresAt, Instant now) {
        // Bound cleanup work per request; unused challenges contain no personal data.
        dsl.deleteFrom(GOOGLE_LOGIN_CHALLENGES).where(GOOGLE_LOGIN_CHALLENGES.NONCE_HASH.in(
                dsl.select(GOOGLE_LOGIN_CHALLENGES.NONCE_HASH).from(GOOGLE_LOGIN_CHALLENGES)
                        .where(GOOGLE_LOGIN_CHALLENGES.EXPIRES_AT.le(now.atOffset(ZoneOffset.UTC))).limit(100)))
                .execute();
        dsl.insertInto(GOOGLE_LOGIN_CHALLENGES).set(GOOGLE_LOGIN_CHALLENGES.NONCE_HASH, nonceHash)
                .set(GOOGLE_LOGIN_CHALLENGES.EXPIRES_AT, expiresAt.atOffset(ZoneOffset.UTC)).execute();
    }

    @Override
    public boolean consume(String nonceHash, Instant now) {
        return dsl.deleteFrom(GOOGLE_LOGIN_CHALLENGES).where(GOOGLE_LOGIN_CHALLENGES.NONCE_HASH.eq(nonceHash))
                .and(GOOGLE_LOGIN_CHALLENGES.EXPIRES_AT.gt(now.atOffset(ZoneOffset.UTC))).execute() == 1;
    }
}
