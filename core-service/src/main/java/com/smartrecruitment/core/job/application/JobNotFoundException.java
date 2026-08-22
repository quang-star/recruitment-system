package com.smartrecruitment.core.job.application;

public class JobNotFoundException extends RuntimeException {
    public JobNotFoundException() { super("Job was not found"); }
}
