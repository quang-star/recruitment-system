package com.smartrecruitment.core.application.api.dto;

import com.smartrecruitment.core.application.domain.Application;

import java.time.OffsetDateTime;

public record ApplicationResponse(Long applicationId, Long candidateUserId, Long companyId, Long cvId,
                                  Long cvVersionId, Long jobId, Long jobVersionId, String coverLetter,
                                  String status, String source,
                                  OffsetDateTime appliedAt, OffsetDateTime updatedAt, long version,
                                  boolean matchingSupported, boolean cvAccessGranted,
                                  String candidateName, String candidateHeadline,
                                  String candidateEmail, String candidatePhone, String jobTitle, String companyName) {
    public static ApplicationResponse from(Application application) {
        return new ApplicationResponse(application.id(), application.candidateUserId(), application.companyId(),
                application.cvId(), application.cvVersionId(), application.jobId(), application.jobVersionId(),
                application.coverLetter(), application.status().name(), application.source().name(), application.appliedAt(),
                application.updatedAt(), application.version(), application.matchingSupported(), application.cvAccessGranted(),
                application.candidateName(), application.candidateHeadline(),
                application.candidateEmail(), application.candidatePhone(), application.jobTitle(), application.companyName());
    }
}
