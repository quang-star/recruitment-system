package com.smartrecruitment.core.application.application;

public class ApplicationNotFoundException extends RuntimeException {
    public ApplicationNotFoundException() { super("Application was not found"); }
}
