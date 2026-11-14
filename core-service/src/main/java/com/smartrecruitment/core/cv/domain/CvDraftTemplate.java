package com.smartrecruitment.core.cv.domain;

import java.util.Arrays;

public enum CvDraftTemplate {
    CLASSIC("classic"),
    MODERN("modern"),
    MINIMAL("minimal"),
    EXECUTIVE("executive");

    private final String key;

    CvDraftTemplate(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public static CvDraftTemplate fromKey(String key) {
        if (key == null) {
            throw new IllegalArgumentException("templateId must not be null");
        }
        return Arrays.stream(values())
                .filter(value -> value.key.equals(key))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unsupported templateId: " + key));
    }
}
