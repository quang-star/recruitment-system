package com.smartrecruitment.core.recruiter.application.port;

public interface CompanyInvitationTokenGenerator {
    String generate();
    String hash(String rawToken);
}

