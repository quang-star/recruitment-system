package com.smartrecruitment.auth.user.application;

public class PasswordPolicyException extends RuntimeException {
    public PasswordPolicyException(String message) {
        super(message);
    }
}
