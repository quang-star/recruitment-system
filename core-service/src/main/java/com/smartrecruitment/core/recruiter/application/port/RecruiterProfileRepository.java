package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.domain.RecruiterProfile;

import java.util.Optional;

public interface RecruiterProfileRepository {
    Optional<RecruiterProfile> findByUserId(Long userId);
    RecruiterProfile insert(RecruiterProfile profile);
    Optional<RecruiterProfile> update(RecruiterProfile profile, long expectedVersion);
}
