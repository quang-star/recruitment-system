package com.smartrecruitment.auth.user.application.port;

public interface VerificationTokenGenerator {

    String generate();

    String hash(String rawToken);
}
