package com.smartrecruitment.core.recruiter.application;

public class CompanyConflictException extends RuntimeException {
    public CompanyConflictException() {
        this("Company was updated by another request or its slug is already used");
    }

    public CompanyConflictException(String message) { super(message); }
}
