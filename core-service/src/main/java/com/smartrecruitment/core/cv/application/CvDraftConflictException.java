package com.smartrecruitment.core.cv.application;

public class CvDraftConflictException extends RuntimeException {
    public CvDraftConflictException() {
        super("CV draft changed; reload before updating or deleting");
    }
}
