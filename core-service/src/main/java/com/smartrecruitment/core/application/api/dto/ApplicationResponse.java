package com.smartrecruitment.core.application.api.dto;

import com.smartrecruitment.core.application.domain.Application;

import com.smartrecruitment.core.candidate.domain.CandidateProfile;

import java.time.OffsetDateTime;

public record ApplicationResponse(Long applicationId, Long candidateUserId, Long companyId, Long cvId,
                                  Long cvVersionId, Long jobId, Long jobVersionId, String coverLetter,
                                  String status, String source,
                                  OffsetDateTime appliedAt, OffsetDateTime updatedAt, long version,
                                  boolean matchingSupported, boolean cvAccessGranted,
                                  String candidateName, String candidateHeadline,
                                  String candidateEmail, String candidatePhone) {
    public static ApplicationResponse from(Application application) {
        return from(application, null);
    }

    public static ApplicationResponse from(Application application, CandidateProfile profile) {
        return new ApplicationResponse(application.id(), application.candidateUserId(), application.companyId(),
                application.cvId(), application.cvVersionId(), application.jobId(), application.jobVersionId(),
                application.coverLetter(), application.status().name(), application.source().name(), application.appliedAt(),
                application.updatedAt(), application.version(), application.matchingSupported(), application.cvAccessGranted(),
                profile != null ? profile.displayName() : null,
                profile != null ? profile.headline() : null,
                profile != null ? profile.contactEmail() : null,
                profile != null ? profile.phoneNumber() : null);
    }
}
