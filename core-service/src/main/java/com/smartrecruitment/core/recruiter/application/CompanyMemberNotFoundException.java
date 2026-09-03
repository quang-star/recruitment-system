package com.smartrecruitment.core.recruiter.application;

public class CompanyMemberNotFoundException extends RuntimeException {
    public CompanyMemberNotFoundException() { super("Company member was not found"); }
}

