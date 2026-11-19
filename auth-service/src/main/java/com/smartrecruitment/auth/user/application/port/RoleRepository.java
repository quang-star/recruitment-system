package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;

public interface RoleRepository {
    List<String> findActiveRoleCodes(Long userId);
    default Map<Long, List<String>> findActiveRoleCodesByUserIds(Collection<Long> userIds) { return Map.of(); }
    default void assignCandidateRole(Long userId, Instant assignedAt) {}
    default void assignRecruiterRole(Long userId, Instant assignedAt) {}
}
