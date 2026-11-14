package com.smartrecruitment.core.cv.domain;

import java.util.Arrays;
import java.util.List;

public enum CvDraftSection {
    INTRODUCTION("introduction"),
    SKILLS("skills"),
    EXPERIENCES("experiences"),
    EDUCATION("education"),
    PROJECTS("projects"),
    CERTIFICATES("certificates"),
    LANGUAGES("languages"),
    AWARDS("awards"),
    ACTIVITIES("activities"),
    HOBBIES("hobbies");

    private final String key;

    CvDraftSection(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public static List<CvDraftSection> defaultOrder() {
        return List.of(values());
    }

    public static CvDraftSection fromKey(String key) {
        if (key == null) {
            throw new IllegalArgumentException("section key must not be null");
        }
        return Arrays.stream(values())
                .filter(value -> value.key.equals(key))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unsupported section: " + key));
    }
}
