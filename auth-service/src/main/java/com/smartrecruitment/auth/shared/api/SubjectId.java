package com.smartrecruitment.auth.shared.api;

import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

/** Canonical positive BIGINT subject; malformed and legacy subjects are rejected. */
public final class SubjectId {
    private SubjectId() { }

    public static Long parse(String value) {
        try {
            if (value == null || !value.matches("[1-9][0-9]{0,18}")) {
                throw new IllegalArgumentException("Invalid subject");
            }
            return Long.valueOf(value);
        } catch (IllegalArgumentException exception) {
            throw new InvalidBearerTokenException("JWT subject must be a positive BIGINT ID");
        }
    }
}
