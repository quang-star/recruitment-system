package com.smartrecruitment.auth.user.application;

public class InvalidPasswordResetTokenException extends RuntimeException {
    public InvalidPasswordResetTokenException() {
        super("Password reset token is invalid, expired, or already used");
    }
}
