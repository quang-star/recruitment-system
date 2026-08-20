package com.smartrecruitment.core.cv.domain;

public enum CvProcessingStatus {
    UPLOADED,
    QUEUED,
    PROCESSING,
    PARSED,
    NEEDS_REVIEW,
    CONFIRMED,
    REJECTED,
    FAILED,
    SUPERSEDED,
    DELETED
}
