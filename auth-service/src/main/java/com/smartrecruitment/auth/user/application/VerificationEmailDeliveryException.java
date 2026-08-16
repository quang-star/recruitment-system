package com.smartrecruitment.auth.user.application;

public class VerificationEmailDeliveryException extends RuntimeException {
    public VerificationEmailDeliveryException(Throwable cause) {
        super("Verification email could not be delivered", cause);
    }
}
