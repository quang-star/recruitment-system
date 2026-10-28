package com.smartrecruitment.core.shared.api;

import com.smartrecruitment.core.shared.domain.BusinessIds;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

public final class SubjectId {
    private SubjectId() { }

    public static Long parse(String subject) {
        try {
            return BusinessIds.parse(subject);
        } catch (IllegalArgumentException exception) {
            throw new InvalidBearerTokenException("JWT subject must be a positive BIGINT ID");
        }
    }
}
