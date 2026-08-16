package com.smartrecruitment.auth.user.application;

public class CurrentUserUnavailableException extends RuntimeException {
    public CurrentUserUnavailableException() {
        super("The authenticated user is no longer available");
    }
}
