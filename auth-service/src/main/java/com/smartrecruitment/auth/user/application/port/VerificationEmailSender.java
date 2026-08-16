package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;

public interface VerificationEmailSender {
    void send(String recipient, String rawToken, Instant expiresAt);
}
