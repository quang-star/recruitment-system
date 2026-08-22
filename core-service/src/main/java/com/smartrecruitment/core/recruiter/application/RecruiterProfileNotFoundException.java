package com.smartrecruitment.core.recruiter.application;

public class RecruiterProfileNotFoundException extends RuntimeException {
    public RecruiterProfileNotFoundException() {
        super("Recruiter profile was not found");
    }
}
