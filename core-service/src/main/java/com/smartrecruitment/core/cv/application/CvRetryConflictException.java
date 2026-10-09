package com.smartrecruitment.core.cv.application;

public class CvRetryConflictException extends RuntimeException {
    public CvRetryConflictException() {
        super("CV cannot be retried in its current state; refresh the CV list");
    }
}
