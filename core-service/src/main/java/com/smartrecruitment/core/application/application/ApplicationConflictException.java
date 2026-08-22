package com.smartrecruitment.core.application.application;

public class ApplicationConflictException extends RuntimeException {
    public ApplicationConflictException() { super("Application already exists or was changed by another request"); }
}
