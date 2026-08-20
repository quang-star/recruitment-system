package com.smartrecruitment.core.candidate.application.port;

import com.smartrecruitment.core.candidate.domain.CandidateProfile;

import java.util.Optional;
import java.util.UUID;

public interface CandidateProfileRepository {
    Optional<CandidateProfile> findByUserId(UUID userId);
    CandidateProfile insert(CandidateProfile profile);
    Optional<CandidateProfile> update(CandidateProfile profile, long expectedVersion);
}
