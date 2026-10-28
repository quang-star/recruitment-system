package com.smartrecruitment.core.candidate.api.dto;

import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;


public record CandidateProfileResponse(Long candidateProfileId, Long userId, String displayName, String headline,
                                       String locationText, ProfileVisibility visibility, long version,
                                       String phoneNumber, String contactEmail, String linkedinUrl,
                                       String githubUrl, String portfolioUrl, String avatarUrl, String bio) {
    public static CandidateProfileResponse from(CandidateProfile profile) {
        return new CandidateProfileResponse(profile.id(), profile.userId(), profile.displayName(),
                profile.headline(), profile.locationText(), profile.visibility(), profile.version(),
                profile.phoneNumber(), profile.contactEmail(), profile.linkedinUrl(),
                profile.githubUrl(), profile.portfolioUrl(), profile.avatarUrl(), profile.bio());
    }
}
