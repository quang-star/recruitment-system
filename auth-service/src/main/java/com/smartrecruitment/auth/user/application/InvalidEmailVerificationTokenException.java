package com.smartrecruitment.auth.user.application;

public class InvalidEmailVerificationTokenException extends RuntimeException {

    public InvalidEmailVerificationTokenException() {
        super("The email verification token is invalid or expired");
    }
}
