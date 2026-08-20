package com.smartrecruitment.core.candidate.application;

public class CandidateProfileNotFoundException extends RuntimeException {
    public CandidateProfileNotFoundException() {
        super("Candidate profile was not found");
    }
}
