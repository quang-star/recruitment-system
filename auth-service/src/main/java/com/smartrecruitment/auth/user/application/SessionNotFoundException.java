package com.smartrecruitment.auth.user.application;

public class SessionNotFoundException extends RuntimeException {
    public SessionNotFoundException() {
        super("Session was not found or has already been revoked");
    }
}
