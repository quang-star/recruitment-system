package com.smartrecruitment.auth.user.infrastructure.persistence;

import com.smartrecruitment.auth.user.application.port.RoleRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    public Map<Long, List<String>> findActiveRoleCodesByUserIds(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) return Map.of();
        Map<Long, List<String>> result = new LinkedHashMap<>();
        dsl.select(USER_ROLES.USER_ID, ROLES.CODE)
                .from(USER_ROLES)
                .join(ROLES).on(ROLES.ID.eq(USER_ROLES.ROLE_ID))
                .where(USER_ROLES.USER_ID.in(userIds))
                .and(ROLES.STATUS.eq("ACTIVE"))
                .orderBy(USER_ROLES.USER_ID.asc(), ROLES.CODE.asc())
                .forEach(row -> result
                        .computeIfAbsent(row.get(USER_ROLES.USER_ID), ignored -> new ArrayList<>())
                        .add(row.get(ROLES.CODE)));
        return result;
    }
    @Override
    public void assignCandidateRole(Long userId, Instant assignedAt) {
        assignRole(userId, "CANDIDATE", assignedAt);
    }

    @Override
    public void assignRecruiterRole(Long userId, Instant assignedAt) {
        assignRole(userId, "RECRUITER", assignedAt);
    }

    private void assignRole(Long userId, String roleCode, Instant assignedAt) {
        Optional<Long> roleId = dsl.select(ROLES.ID).from(ROLES).where(ROLES.CODE.eq(roleCode))
                .and(ROLES.STATUS.eq("ACTIVE")).fetchOptional(ROLES.ID);
        if (roleId.isEmpty()) throw new IllegalStateException(roleCode + " system role is not seeded");
        dsl.insertInto(USER_ROLES).set(USER_ROLES.USER_ID, userId).set(USER_ROLES.ROLE_ID, roleId.get())
                .set(USER_ROLES.ASSIGNED_AT, assignedAt.atOffset(ZoneOffset.UTC))
                .onConflict(USER_ROLES.USER_ID, USER_ROLES.ROLE_ID).doNothing().execute();
    }
}
