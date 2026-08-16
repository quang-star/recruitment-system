package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;
import java.util.List;

public interface RoleRepository {
    List<String> findActiveRoleCodes(Long userId);
    default void assignCandidateRole(Long userId, Instant assignedAt) {}
}
