package com.smartrecruitment.core.candidate.application;

public class CandidateProfileConflictException extends RuntimeException {
    public CandidateProfileConflictException() {
        super("Candidate profile was updated by another request");
    }
}
