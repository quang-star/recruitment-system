package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.user.application.port.RoleRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.Roles.ROLES;
import static com.smartrecruitment.auth.infrastructure.jooq.generated.tables.UserRoles.USER_ROLES;

@Repository
public class JooqRoleRepository implements RoleRepository {
    private final DSLContext dsl;
    public JooqRoleRepository(DSLContext dsl) { this.dsl = dsl; }
    @Override
    public List<String> findActiveRoleCodes(Long userId) {
        return dsl.select(ROLES.CODE).from(USER_ROLES).join(ROLES).on(ROLES.ID.eq(USER_ROLES.ROLE_ID))
                .where(USER_ROLES.USER_ID.eq(userId)).and(ROLES.STATUS.eq("ACTIVE"))
                .orderBy(ROLES.CODE.asc()).fetch(ROLES.CODE);
    }
    @Override
    public void assignCandidateRole(Long userId, Instant assignedAt) {
        Optional<Long> roleId = dsl.select(ROLES.ID).from(ROLES).where(ROLES.CODE.eq("CANDIDATE"))
                .and(ROLES.STATUS.eq("ACTIVE")).fetchOptional(ROLES.ID);
        if (roleId.isEmpty()) throw new IllegalStateException("CANDIDATE system role is not seeded");
        if (!dsl.fetchExists(dsl.selectOne().from(USER_ROLES).where(USER_ROLES.USER_ID.eq(userId))
                .and(USER_ROLES.ROLE_ID.eq(roleId.get()))) ) {
            dsl.insertInto(USER_ROLES).set(USER_ROLES.USER_ID, userId).set(USER_ROLES.ROLE_ID, roleId.get())
                    .set(USER_ROLES.ASSIGNED_AT, assignedAt.atOffset(ZoneOffset.UTC)).execute();
        }
    }
}
