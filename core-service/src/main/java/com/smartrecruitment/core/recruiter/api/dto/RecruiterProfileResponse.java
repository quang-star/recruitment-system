package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.RecruiterProfile;

import java.util.UUID;

public record RecruiterProfileResponse(UUID recruiterProfileId, UUID userId, String displayName,
                                       String businessTitle, String businessPhone, long version) {
    public static RecruiterProfileResponse from(RecruiterProfile profile) {
        return new RecruiterProfileResponse(profile.publicId(), profile.userId(), profile.displayName(),
                profile.businessTitle(), profile.businessPhone(), profile.version());
    }
}
