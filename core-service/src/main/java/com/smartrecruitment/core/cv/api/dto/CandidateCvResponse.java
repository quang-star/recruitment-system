package com.smartrecruitment.core.cv.api.dto;

import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;
import com.smartrecruitment.core.cv.domain.CvStatus;

import java.util.UUID;

public record CandidateCvResponse(UUID cvId, UUID candidateUserId, String title, CvStatus status,
                                  CvVersionResponse activeVersion, long version) {
    public static CandidateCvResponse from(CandidateCv cv) {
        return new CandidateCvResponse(cv.publicId(), cv.candidateUserId(), cv.title(), cv.status(),
                new CvVersionResponse(cv.activeVersion().publicId(), cv.activeVersion().versionNumber(),
                        cv.activeVersion().originalFilename(), cv.activeVersion().mimeType(),
                        cv.activeVersion().sizeBytes(), cv.activeVersion().sha256(),
                        cv.activeVersion().processingStatus(), cv.activeVersion().failureCode(),
                        cv.activeVersion().version()), cv.version());
    }

    public record CvVersionResponse(UUID cvVersionId, int versionNumber, String originalFilename,
                                    String mimeType, long sizeBytes, String sha256,
                                    CvProcessingStatus processingStatus, String failureCode, long version) {
    }
}
