package com.smartrecruitment.core.recruiter.application.port;

import java.time.OffsetDateTime;

public interface CompanyInvitationSender {
    void send(String email, String companyName, String role, String rawToken, OffsetDateTime expiresAt);
}

