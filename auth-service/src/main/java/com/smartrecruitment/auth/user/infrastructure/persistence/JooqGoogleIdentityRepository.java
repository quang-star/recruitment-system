package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.user.application.port.GoogleIdentityRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.util.Optional;

import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.GoogleIdentities.GOOGLE_IDENTITIES;

@Repository
public class JooqGoogleIdentityRepository implements GoogleIdentityRepository {
    private final DSLContext dsl;

    public JooqGoogleIdentityRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Optional<Long> findUserId(String subject) {
        return dsl.select(GOOGLE_IDENTITIES.USER_ID).from(GOOGLE_IDENTITIES)
                .where(GOOGLE_IDENTITIES.SUBJECT.eq(subject)).fetchOptional(GOOGLE_IDENTITIES.USER_ID);
    }

    @Override
    public boolean link(String subject, Long userId) {
        return dsl.insertInto(GOOGLE_IDENTITIES).set(GOOGLE_IDENTITIES.SUBJECT, subject)
                .set(GOOGLE_IDENTITIES.USER_ID, userId).onConflictDoNothing().execute() == 1;
    }
}
