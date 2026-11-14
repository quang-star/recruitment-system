package com.smartrecruitment.core.cv.application;

public class CvDraftNotFoundException extends RuntimeException {
    public CvDraftNotFoundException() {
        super("CV draft not found");
    }
}
