package com.smartrecruitment.core.candidate.api.dto;

import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;

import java.util.UUID;

public record CandidateProfileResponse(UUID candidateProfileId, UUID userId, String displayName, String headline,
                                       String locationText, ProfileVisibility visibility, long version) {
    public static CandidateProfileResponse from(CandidateProfile profile) {
        return new CandidateProfileResponse(profile.publicId(), profile.userId(), profile.displayName(),
                profile.headline(), profile.locationText(), profile.visibility(), profile.version());
    }
}
