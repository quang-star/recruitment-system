package com.smartrecruitment.core.cv.application;

public class CandidateCvNotFoundException extends RuntimeException {
    public CandidateCvNotFoundException() {
        super("CV was not found");
    }
}
