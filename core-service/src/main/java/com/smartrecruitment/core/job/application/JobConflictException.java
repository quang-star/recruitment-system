package com.smartrecruitment.core.job.application;

public class JobConflictException extends RuntimeException {
    public JobConflictException() { super("Job was changed by another request or is not editable"); }
}
