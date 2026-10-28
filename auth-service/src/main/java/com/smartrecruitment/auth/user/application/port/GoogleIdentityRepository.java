package com.smartrecruitment.auth.user.application.port;

import java.util.Optional;

public interface GoogleIdentityRepository {
    Optional<Long> findUserId(String subject);
    boolean link(String subject, Long userId);
}
