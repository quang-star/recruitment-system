package com.smartrecruitment.core.recruiter.application;

public class CompanyInvitationDeliveryException extends RuntimeException {
    public CompanyInvitationDeliveryException(Throwable cause) { super("Company invitation email could not be delivered", cause); }
}

