package com.smartrecruitment.core.recruiter.application;

public class CompanyInvitationNotFoundException extends RuntimeException {
    public CompanyInvitationNotFoundException() { super("Company invitation was not found or is no longer active"); }
}

