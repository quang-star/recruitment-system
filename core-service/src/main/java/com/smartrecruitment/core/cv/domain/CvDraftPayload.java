package com.smartrecruitment.core.cv.domain;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public record CvDraftPayload(
        String fullName,
        String headline,
        String email,
        String phone,
        String location,
        String links,
        String introduction,
        String skills,
        List<CvDraftEntry> experiences,
        List<CvDraftEntry> education,
        List<CvDraftEntry> projects,
        List<CvDraftEntry> certificates,
        List<CvDraftEntry> languages,
        String photoDataUrl,
        String language,
        String fontSize,
        String lineSpacing,
        List<CvDraftSection> hiddenSections,
        String fontFamily,
        String dateOfBirth,
        String gender,
        List<CvDraftEntry> awards,
        List<CvDraftEntry> activities,
        List<CvDraftEntry> hobbies,
        Map<String, String> sectionTitles) {

    public static final int MAX_SECTION_ENTRIES = 20;
    public static final int MAX_PHOTO_DATA_URL_LENGTH = 160_000;
    public static final int MAX_SECTION_TITLE_LENGTH = 80;

    private static final Pattern SAFE_PHOTO_DATA_URL = Pattern.compile(
            "^(?:|data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$"
    );
    private static final Set<String> ALLOWED_LANGUAGES = Set.of("vi", "en");
    private static final Set<String> ALLOWED_FONT_SIZES = Set.of("small", "medium", "large");
    private static final Set<String> ALLOWED_LINE_SPACINGS = Set.of("compact", "normal", "relaxed");
    private static final Set<String> ALLOWED_FONT_FAMILIES = Set.of("sans", "serif", "mono");

    public CvDraftPayload(
            String fullName,
            String headline,
            String email,
            String phone,
            String location,
            String links,
            String introduction,
            String skills,
            List<CvDraftEntry> experiences,
            List<CvDraftEntry> education,
            List<CvDraftEntry> projects,
            List<CvDraftEntry> certificates,
            List<CvDraftEntry> languages) {
        this(fullName, headline, email, phone, location, links, introduction, skills,
                experiences, education, projects, certificates, languages,
                "", "vi", "medium", "normal", List.of(),
                "sans", "", "", List.of(), List.of(), List.of(), Map.of());
    }

    public CvDraftPayload(
            String fullName,
            String headline,
            String email,
            String phone,
            String location,
            String links,
            String introduction,
            String skills,
            List<CvDraftEntry> experiences,
            List<CvDraftEntry> education,
            List<CvDraftEntry> projects,
            List<CvDraftEntry> certificates,
            List<CvDraftEntry> languages,
            String photoDataUrl,
            String language,
            String fontSize,
            String lineSpacing,
            List<CvDraftSection> hiddenSections) {
        this(fullName, headline, email, phone, location, links, introduction, skills,
                experiences, education, projects, certificates, languages,
                photoDataUrl, language, fontSize, lineSpacing, hiddenSections,
                "sans", "", "", List.of(), List.of(), List.of(), Map.of());
    }

    public CvDraftPayload {
        fullName = requireBounded(fullName, 200, "fullName");
        headline = requireBounded(headline, 240, "headline");
        email = requireBounded(email, 320, "email");
        phone = requireBounded(phone, 80, "phone");
        location = requireBounded(location, 240, "location");
        links = requireBounded(links, 2000, "links");
        introduction = requireBounded(introduction, 6000, "introduction");
        skills = requireBounded(skills, 4000, "skills");

        experiences = copySection(experiences, "experiences");
        education = copySection(education, "education");
        projects = copySection(projects, "projects");
        certificates = copySection(certificates, "certificates");
        languages = copySection(languages, "languages");
        awards = copyOptionalSection(awards, "awards");
        activities = copyOptionalSection(activities, "activities");
        hobbies = copyOptionalSection(hobbies, "hobbies");

        Set<String> seenIds = new HashSet<>();
        for (var section : List.of(experiences, education, projects, certificates, languages, awards, activities, hobbies)) {
            for (var entry : section) {
                if (!seenIds.add(entry.id())) {
                    throw new IllegalArgumentException("Duplicate entry id: " + entry.id());
                }
            }
        }

        photoDataUrl = validatePhotoDataUrl(photoDataUrl);
        language = normalizeOption(language, "vi", ALLOWED_LANGUAGES, "language");
        fontSize = normalizeOption(fontSize, "medium", ALLOWED_FONT_SIZES, "fontSize");
        lineSpacing = normalizeOption(lineSpacing, "normal", ALLOWED_LINE_SPACINGS, "lineSpacing");
        hiddenSections = copyHiddenSections(hiddenSections);
        fontFamily = normalizeOption(fontFamily, "sans", ALLOWED_FONT_FAMILIES, "fontFamily");
        dateOfBirth = optionalBounded(dateOfBirth, 40, "dateOfBirth");
        gender = optionalBounded(gender, 40, "gender");
        sectionTitles = copySectionTitles(sectionTitles);
    }

    private static String validatePhotoDataUrl(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        if (value.length() > MAX_PHOTO_DATA_URL_LENGTH) {
            throw new IllegalArgumentException("photoDataUrl exceeds " + MAX_PHOTO_DATA_URL_LENGTH + " characters");
        }
        if (!SAFE_PHOTO_DATA_URL.matcher(value).matches()) {
            throw new IllegalArgumentException("photoDataUrl must be a base64 PNG, JPEG, or WebP data URL");
        }
        return value;
    }

    private static String normalizeOption(String value, String fallback, Set<String> allowed, String field) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        if (!allowed.contains(value)) {
            throw new IllegalArgumentException("Unsupported " + field + ": " + value);
        }
        return value;
    }

    private static List<CvDraftSection> copyHiddenSections(List<CvDraftSection> sections) {
        if (sections == null || sections.isEmpty()) {
            return List.of();
        }
        if (sections.size() > CvDraftSection.values().length) {
            throw new IllegalArgumentException("hiddenSections exceeds maximum section count");
        }
        var unique = new LinkedHashSet<CvDraftSection>();
        for (var section : sections) {
            Objects.requireNonNull(section, "hiddenSections element");
            if (!unique.add(section)) {
                throw new IllegalArgumentException("Duplicate hiddenSection: " + section.key());
            }
        }
        return List.copyOf(unique);
    }

    private static String requireBounded(String value, int max, String field) {
        Objects.requireNonNull(value, field);
        if (value.length() > max) {
            throw new IllegalArgumentException(field + " exceeds " + max + " characters");
        }
        return value;
    }

    private static List<CvDraftEntry> copySection(List<CvDraftEntry> entries, String name) {
        Objects.requireNonNull(entries, name);
        if (entries.size() > MAX_SECTION_ENTRIES) {
            throw new IllegalArgumentException(name + " exceeds maximum " + MAX_SECTION_ENTRIES + " entries");
        }
        return List.copyOf(entries);
    }

    private static List<CvDraftEntry> copyOptionalSection(List<CvDraftEntry> entries, String name) {
        if (entries == null || entries.isEmpty()) {
            return List.of();
        }
        return copySection(entries, name);
    }

    private static String optionalBounded(String value, int max, String field) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        if (value.length() > max) {
            throw new IllegalArgumentException(field + " exceeds " + max + " characters");
        }
        return value;
    }

    private static Map<String, String> copySectionTitles(Map<String, String> titles) {
        if (titles == null || titles.isEmpty()) {
            return Map.of();
        }
        var clean = new LinkedHashMap<String, String>();
        for (var entry : titles.entrySet()) {
            String key = Objects.requireNonNull(entry.getKey(), "sectionTitles key");
            CvDraftSection.fromKey(key);
            String value = entry.getValue();
            if (value == null) continue;
            String trimmed = value.trim();
            if (trimmed.isEmpty()) continue;
            if (trimmed.length() > MAX_SECTION_TITLE_LENGTH) {
                throw new IllegalArgumentException("sectionTitles." + key + " exceeds " + MAX_SECTION_TITLE_LENGTH + " characters");
            }
            clean.put(key, trimmed);
        }
        return Map.copyOf(clean);
    }
}
