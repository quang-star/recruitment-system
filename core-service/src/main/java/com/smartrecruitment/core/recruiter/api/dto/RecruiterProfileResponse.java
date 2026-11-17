package com.smartrecruitment.core.recruiter.api.dto;

import com.smartrecruitment.core.recruiter.domain.RecruiterProfile;


public record RecruiterProfileResponse(Long recruiterProfileId, Long userId, String displayName,
                                       String businessTitle, String businessPhone, long version) {
    public static RecruiterProfileResponse from(RecruiterProfile profile) {
        return new RecruiterProfileResponse(profile.id(), profile.userId(), profile.displayName(),
                profile.businessTitle(), profile.businessPhone(), profile.version());
    }
}
