package com.smartrecruitment.core.cv.api.dto;

import com.smartrecruitment.core.cv.domain.CvDraftEntry;
import com.smartrecruitment.core.cv.domain.CvDraftPayload;
import com.smartrecruitment.core.cv.domain.CvDraftSection;
import com.smartrecruitment.core.cv.domain.CvDraftTemplate;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public record SaveCvDraftRequest(
        @NotBlank @Size(max = 160) String title,
        @NotBlank String templateId,
        @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String accentColor,
        @NotNull @Size(min = 7, max = 10) List<@NotBlank String> sectionOrder,
        @NotNull @Valid PayloadDto payload,
        @Min(0) Long expectedVersion) {

    public CvDraftTemplate toDomainTemplate() {
        return CvDraftTemplate.fromKey(templateId);
    }

    public List<CvDraftSection> toDomainSections() {
        return sectionOrder.stream().map(CvDraftSection::fromKey).toList();
    }

    public CvDraftPayload toDomainPayload() {
        List<CvDraftSection> hidden = payload.hiddenSections() == null
                ? List.of()
                : payload.hiddenSections().stream().map(CvDraftSection::fromKey).toList();
        return new CvDraftPayload(
                payload.fullName(),
                payload.headline(),
                payload.email(),
                payload.phone(),
                payload.location(),
                payload.links(),
                payload.introduction(),
                payload.skills(),
                payload.experiences().stream().map(EntryDto::toDomain).toList(),
                payload.education().stream().map(EntryDto::toDomain).toList(),
                payload.projects().stream().map(EntryDto::toDomain).toList(),
                payload.certificates().stream().map(EntryDto::toDomain).toList(),
                payload.languages().stream().map(EntryDto::toDomain).toList(),
                payload.photoDataUrl(),
                payload.language(),
                payload.fontSize(),
                payload.lineSpacing(),
                hidden,
                payload.fontFamily(),
                payload.dateOfBirth(),
                payload.gender(),
                payload.awards() == null ? List.of() : payload.awards().stream().map(EntryDto::toDomain).toList(),
                payload.activities() == null ? List.of() : payload.activities().stream().map(EntryDto::toDomain).toList(),
                payload.hobbies() == null ? List.of() : payload.hobbies().stream().map(EntryDto::toDomain).toList(),
                payload.sectionTitles()
        );
    }

    public record PayloadDto(
            @NotNull @Size(max = 200) String fullName,
            @NotNull @Size(max = 240) String headline,
            @NotNull @Size(max = 320) String email,
            @NotNull @Size(max = 80) String phone,
            @NotNull @Size(max = 240) String location,
            @NotNull @Size(max = 2000) String links,
            @NotNull @Size(max = 6000) String introduction,
            @NotNull @Size(max = 4000) String skills,
            @NotNull @Size(max = 20) List<@Valid EntryDto> experiences,
            @NotNull @Size(max = 20) List<@Valid EntryDto> education,
            @NotNull @Size(max = 20) List<@Valid EntryDto> projects,
            @NotNull @Size(max = 20) List<@Valid EntryDto> certificates,
            @NotNull @Size(max = 20) List<@Valid EntryDto> languages,
            @Size(max = 160000) String photoDataUrl,
            @Size(max = 8) String language,
            @Size(max = 16) String fontSize,
            @Size(max = 16) String lineSpacing,
            @Size(max = 10) List<@NotBlank String> hiddenSections,
            @Size(max = 16) String fontFamily,
            @Size(max = 40) String dateOfBirth,
            @Size(max = 40) String gender,
            @Size(max = 20) List<@Valid EntryDto> awards,
            @Size(max = 20) List<@Valid EntryDto> activities,
            @Size(max = 20) List<@Valid EntryDto> hobbies,
            @Size(max = 10) Map<@NotBlank String, @Size(max = 80) String> sectionTitles) {
    }

    public record EntryDto(
            @NotBlank @Size(max = 64) String id,
            @NotNull @Size(max = 240) String title,
            @NotNull @Size(max = 240) String subtitle,
            @NotNull @Size(max = 7) String startMonth,
            @NotNull @Size(max = 7) String endMonth,
            boolean current,
            @NotNull @Size(max = 8000) String description) {
        public CvDraftEntry toDomain() {
            return new CvDraftEntry(id, title, subtitle, startMonth, endMonth, current, description);
        }
    }
}
