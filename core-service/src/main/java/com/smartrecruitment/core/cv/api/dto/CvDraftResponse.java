package com.smartrecruitment.core.cv.api.dto;

import com.smartrecruitment.core.cv.domain.CvDraft;
import com.smartrecruitment.core.cv.domain.CvDraftEntry;
import com.smartrecruitment.core.cv.domain.CvDraftPayload;
import com.smartrecruitment.core.cv.domain.CvDraftSection;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public record CvDraftResponse(
        Long draftId,
        Long candidateUserId,
        String title,
        String templateId,
        String accentColor,
        List<String> sectionOrder,
        PayloadResponse payload,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static CvDraftResponse from(CvDraft draft) {
        return new CvDraftResponse(
                draft.id(),
                draft.candidateUserId(),
                draft.title(),
                draft.templateId().key(),
                draft.accentColor(),
                draft.sectionOrder().stream().map(CvDraftSection::key).toList(),
                PayloadResponse.from(draft.payload()),
                draft.createdAt(),
                draft.updatedAt(),
                draft.version()
        );
    }

    public record PayloadResponse(
            String fullName,
            String headline,
            String email,
            String phone,
            String location,
            String links,
            String introduction,
            String skills,
            List<EntryResponse> experiences,
            List<EntryResponse> education,
            List<EntryResponse> projects,
            List<EntryResponse> certificates,
            List<EntryResponse> languages,
            String photoDataUrl,
            String language,
            String fontSize,
            String lineSpacing,
            List<String> hiddenSections,
            String fontFamily,
            String dateOfBirth,
            String gender,
            List<EntryResponse> awards,
            List<EntryResponse> activities,
            List<EntryResponse> hobbies,
            Map<String, String> sectionTitles) {

        static PayloadResponse from(CvDraftPayload payload) {
            return new PayloadResponse(
                    payload.fullName(),
                    payload.headline(),
                    payload.email(),
                    payload.phone(),
                    payload.location(),
                    payload.links(),
                    payload.introduction(),
                    payload.skills(),
                    payload.experiences().stream().map(EntryResponse::from).toList(),
                    payload.education().stream().map(EntryResponse::from).toList(),
                    payload.projects().stream().map(EntryResponse::from).toList(),
                    payload.certificates().stream().map(EntryResponse::from).toList(),
                    payload.languages().stream().map(EntryResponse::from).toList(),
                    payload.photoDataUrl(),
                    payload.language(),
                    payload.fontSize(),
                    payload.lineSpacing(),
                    payload.hiddenSections().stream().map(CvDraftSection::key).toList(),
                    payload.fontFamily(),
                    payload.dateOfBirth(),
                    payload.gender(),
                    payload.awards().stream().map(EntryResponse::from).toList(),
                    payload.activities().stream().map(EntryResponse::from).toList(),
                    payload.hobbies().stream().map(EntryResponse::from).toList(),
                    payload.sectionTitles()
            );
        }
    }

    public record EntryResponse(
            String id,
            String title,
            String subtitle,
            String startMonth,
            String endMonth,
            boolean current,
            String description) {

        static EntryResponse from(CvDraftEntry entry) {
            return new EntryResponse(
                    entry.id(),
                    entry.title(),
                    entry.subtitle(),
                    entry.startMonth(),
                    entry.endMonth(),
                    entry.current(),
                    entry.description()
            );
        }
    }
}
