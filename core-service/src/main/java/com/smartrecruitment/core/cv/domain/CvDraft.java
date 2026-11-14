package com.smartrecruitment.core.cv.domain;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public record CvDraft(
        Long id,
        Long candidateUserId,
        String title,
        CvDraftTemplate templateId,
        String accentColor,
        List<CvDraftSection> sectionOrder,
        CvDraftPayload payload,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static final int MAX_DRAFTS_PER_CANDIDATE = 50;
    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    public CvDraft {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(candidateUserId, "candidateUserId");
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title must not be blank");
        }
        title = title.trim();
        if (title.length() > 160) {
            throw new IllegalArgumentException("title must not exceed 160 characters");
        }
        Objects.requireNonNull(templateId, "templateId");
        if (accentColor == null || !HEX_COLOR.matcher(accentColor).matches()) {
            throw new IllegalArgumentException("accentColor must be a #RRGGBB hex color");
        }
        accentColor = accentColor.toLowerCase();
        Objects.requireNonNull(sectionOrder, "sectionOrder");
        var seen = new java.util.LinkedHashSet<CvDraftSection>();
        for (var section : sectionOrder) {
            Objects.requireNonNull(section, "sectionOrder element");
            if (!seen.add(section)) {
                throw new IllegalArgumentException("sectionOrder must contain each CV section at most once");
            }
        }
        var legacyRequired = List.of(
                CvDraftSection.INTRODUCTION,
                CvDraftSection.SKILLS,
                CvDraftSection.EXPERIENCES,
                CvDraftSection.EDUCATION,
                CvDraftSection.PROJECTS,
                CvDraftSection.CERTIFICATES,
                CvDraftSection.LANGUAGES
        );
        if (!seen.containsAll(legacyRequired)) {
            throw new IllegalArgumentException("sectionOrder must include all core CV sections");
        }
        for (var section : CvDraftSection.values()) {
            seen.add(section);
        }
        sectionOrder = List.copyOf(seen);
        Objects.requireNonNull(payload, "payload");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
        if (version < 0) {
            throw new IllegalArgumentException("version must not be negative");
        }
    }

    public static CvDraft create(Long candidateUserId, String title, CvDraftTemplate templateId,
                                 String accentColor, List<CvDraftSection> sectionOrder,
                                 CvDraftPayload payload, OffsetDateTime now) {
        return new CvDraft(0L, candidateUserId, title, templateId, accentColor, sectionOrder, payload, now, now, 0L);
    }
}
