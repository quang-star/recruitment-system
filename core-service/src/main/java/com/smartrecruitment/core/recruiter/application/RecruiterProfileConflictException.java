package com.smartrecruitment.core.recruiter.application;

public class RecruiterProfileConflictException extends RuntimeException {
    public RecruiterProfileConflictException() {
        super("Recruiter profile was updated by another request");
    }
}
