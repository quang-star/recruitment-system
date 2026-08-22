package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.domain.RecruiterProfile;

import java.util.Optional;
import java.util.UUID;

public interface RecruiterProfileRepository {
    Optional<RecruiterProfile> findByUserId(UUID userId);
    RecruiterProfile insert(RecruiterProfile profile);
    Optional<RecruiterProfile> update(RecruiterProfile profile, long expectedVersion);
}
