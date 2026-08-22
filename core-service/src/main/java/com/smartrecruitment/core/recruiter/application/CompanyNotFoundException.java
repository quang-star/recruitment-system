package com.smartrecruitment.core.recruiter.application;

public class CompanyNotFoundException extends RuntimeException {
    public CompanyNotFoundException() {
        super("Company was not found");
    }
}
