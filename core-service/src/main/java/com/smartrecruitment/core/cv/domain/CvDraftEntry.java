package com.smartrecruitment.core.cv.domain;

import java.util.Objects;
import java.util.regex.Pattern;

public record CvDraftEntry(
        String id,
        String title,
        String subtitle,
        String startMonth,
        String endMonth,
        boolean current,
        String description) {

    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
    private static final Pattern MONTH_PATTERN = Pattern.compile("^(?:|(?!0000)\\d{4}-(?:0[1-9]|1[0-2]))$");

    public CvDraftEntry {
        Objects.requireNonNull(id, "entry.id");
        Objects.requireNonNull(title, "entry.title");
        Objects.requireNonNull(subtitle, "entry.subtitle");
        Objects.requireNonNull(startMonth, "entry.startMonth");
        Objects.requireNonNull(endMonth, "entry.endMonth");
        Objects.requireNonNull(description, "entry.description");
        if (!ID_PATTERN.matcher(id).matches()) {
            throw new IllegalArgumentException("Invalid entry id");
        }
        if (title.length() > 240) throw new IllegalArgumentException("entry.title exceeds 240 characters");
        if (subtitle.length() > 240) throw new IllegalArgumentException("entry.subtitle exceeds 240 characters");
        if (description.length() > 8000) throw new IllegalArgumentException("entry.description exceeds 8000 characters");
        if (!MONTH_PATTERN.matcher(startMonth).matches() || !MONTH_PATTERN.matcher(endMonth).matches()) {
            throw new IllegalArgumentException("Dates must be empty or YYYY-MM");
        }
        if (current && !endMonth.isEmpty()) {
            throw new IllegalArgumentException("Current entries cannot have an end month");
        }
        if (!startMonth.isEmpty() && !endMonth.isEmpty() && startMonth.compareTo(endMonth) > 0) {
            throw new IllegalArgumentException("startMonth must not be after endMonth");
        }
    }
}
