package com.smartrecruitment.auth.user.application;

public class CompanyInvitationAcceptanceException extends RuntimeException {
    private final Reason reason;

    public CompanyInvitationAcceptanceException(Reason reason) {
        this.reason = reason;
    }

    public Reason reason() { return reason; }

    public enum Reason { ACCOUNT_INELIGIBLE, NOT_FOUND, CONFLICT, UNAVAILABLE }
}
