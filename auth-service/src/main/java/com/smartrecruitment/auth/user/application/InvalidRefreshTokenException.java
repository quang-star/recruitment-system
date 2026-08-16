package com.smartrecruitment.auth.user.application;
public class InvalidRefreshTokenException extends RuntimeException {
    public InvalidRefreshTokenException() { super("The refresh token is invalid, expired, revoked, or already used"); }
}
