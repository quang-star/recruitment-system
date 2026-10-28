package com.smartrecruitment.auth.user.application.port;

import java.time.Instant;

public interface GoogleLoginChallengeRepository {
    void insert(String nonceHash, Instant expiresAt, Instant now);
    boolean consume(String nonceHash, Instant now);
}
