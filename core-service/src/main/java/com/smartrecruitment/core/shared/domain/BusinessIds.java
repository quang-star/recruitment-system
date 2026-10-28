package com.smartrecruitment.core.shared.domain;

/** Canonical positive decimal identities, shared by HTTP and event adapters. */
public final class BusinessIds {
    private BusinessIds() { }

    public static Long parse(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) {
            throw new IllegalArgumentException("ID must be a positive BIGINT decimal string");
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("ID exceeds the BIGINT range", exception);
        }
    }
}
