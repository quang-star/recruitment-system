package com.smartrecruitment.core.cv.application;

public class CvStorageException extends RuntimeException {
    public CvStorageException(Throwable cause) {
        super("CV storage is temporarily unavailable", cause);
    }
}
