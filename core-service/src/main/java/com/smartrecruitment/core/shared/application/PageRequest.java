package com.smartrecruitment.core.shared.application;

public record PageRequest(int page, int size) {
    public PageRequest {
        if (page < 0 || page > 100_000) throw new IllegalArgumentException("page must be between 0 and 100000");
        if (size < 1 || size > 100) throw new IllegalArgumentException("size must be between 1 and 100");
    }

    public int offset() { return page * size; }

    public static String text(String value) {
        if (value == null) return "";
        if (value.length() > 200) throw new IllegalArgumentException("Search text must not exceed 200 characters");
        return value.strip();
    }
}
