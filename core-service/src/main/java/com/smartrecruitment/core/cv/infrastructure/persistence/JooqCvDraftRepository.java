package com.smartrecruitment.core.cv.infrastructure.persistence;

import com.smartrecruitment.core.cv.application.CvDraftValidationException;
import com.smartrecruitment.core.cv.application.port.CvDraftRepository;
import com.smartrecruitment.core.cv.domain.CvDraft;
import com.smartrecruitment.core.cv.domain.CvDraftPayload;
import com.smartrecruitment.core.cv.domain.CvDraftSection;
import com.smartrecruitment.core.cv.domain.CvDraftTemplate;
import com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.CvDraftsRecord;
import org.jooq.DSLContext;
import org.jooq.JSON;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvDrafts.CV_DRAFTS;

@Repository
public class JooqCvDraftRepository implements CvDraftRepository {
    private static final int MAX_DRAFT_BYTES = 256 * 1024;
    private static final TypeReference<List<String>> SECTION_LIST_TYPE = new TypeReference<>() { };

    private final DSLContext dsl;
    private final ObjectMapper mapper;

    public JooqCvDraftRepository(DSLContext dsl, ObjectMapper mapper) {
        this.dsl = dsl;
        this.mapper = mapper;
    }

    @Override
    public long countOwned(Long candidateUserId) {
        return dsl.fetchCount(dsl.selectFrom(CV_DRAFTS).where(CV_DRAFTS.CANDIDATE_USER_ID.eq(candidateUserId)));
    }

    @Override
    public List<CvDraft> findAllOwned(Long candidateUserId) {
        return dsl.selectFrom(CV_DRAFTS)
                .where(CV_DRAFTS.CANDIDATE_USER_ID.eq(candidateUserId))
                .orderBy(CV_DRAFTS.UPDATED_AT.desc(), CV_DRAFTS.ID.desc())
                .limit(CvDraft.MAX_DRAFTS_PER_CANDIDATE)
                .fetch(this::toDomain);
    }

    @Override
    public Optional<CvDraft> findOwned(Long candidateUserId, Long draftId) {
        return dsl.selectFrom(CV_DRAFTS)
                .where(CV_DRAFTS.ID.eq(draftId))
                .and(CV_DRAFTS.CANDIDATE_USER_ID.eq(candidateUserId))
                .fetchOptional(this::toDomain);
    }

    @Override
    public CvDraft insert(CvDraft draft) {
        String sectionOrderJson = serializeSectionOrder(draft.sectionOrder());
        String contentJson = serializePayload(draft.payload());
        var record = dsl.insertInto(CV_DRAFTS)
                .set(CV_DRAFTS.CANDIDATE_USER_ID, draft.candidateUserId())
                .set(CV_DRAFTS.TITLE, draft.title())
                .set(CV_DRAFTS.TEMPLATE_ID, draft.templateId().key())
                .set(CV_DRAFTS.ACCENT_COLOR, draft.accentColor())
                .set(CV_DRAFTS.SECTION_ORDER, JSON.json(sectionOrderJson))
                .set(CV_DRAFTS.CONTENT_JSON, JSON.json(contentJson))
                .set(CV_DRAFTS.CREATED_AT, draft.createdAt())
                .set(CV_DRAFTS.UPDATED_AT, draft.updatedAt())
                .set(CV_DRAFTS.VERSION, 0L)
                .returning()
                .fetchOne();
        if (record == null) {
            throw new IllegalStateException("Insert CV draft returned no record");
        }
        return toDomain(record);
    }

    @Override
    public Optional<CvDraft> update(CvDraft draft, long expectedVersion) {
        String sectionOrderJson = serializeSectionOrder(draft.sectionOrder());
        String contentJson = serializePayload(draft.payload());
        return dsl.update(CV_DRAFTS)
                .set(CV_DRAFTS.TITLE, draft.title())
                .set(CV_DRAFTS.TEMPLATE_ID, draft.templateId().key())
                .set(CV_DRAFTS.ACCENT_COLOR, draft.accentColor())
                .set(CV_DRAFTS.SECTION_ORDER, JSON.json(sectionOrderJson))
                .set(CV_DRAFTS.CONTENT_JSON, JSON.json(contentJson))
                .set(CV_DRAFTS.UPDATED_AT, draft.updatedAt())
                .set(CV_DRAFTS.VERSION, CV_DRAFTS.VERSION.plus(1L))
                .where(CV_DRAFTS.ID.eq(draft.id()))
                .and(CV_DRAFTS.CANDIDATE_USER_ID.eq(draft.candidateUserId()))
                .and(CV_DRAFTS.VERSION.eq(expectedVersion))
                .returning()
                .fetchOptional()
                .map(this::toDomain);
    }

    @Override
    public boolean deleteOwned(Long candidateUserId, Long draftId, long expectedVersion) {
        return dsl.deleteFrom(CV_DRAFTS)
                .where(CV_DRAFTS.ID.eq(draftId))
                .and(CV_DRAFTS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(CV_DRAFTS.VERSION.eq(expectedVersion))
                .execute() == 1;
    }

    private String serializeSectionOrder(List<CvDraftSection> order) {
        return mapper.writeValueAsString(order.stream().map(CvDraftSection::key).toList());
    }

    private String serializePayload(CvDraftPayload payload) {
        String json = mapper.writeValueAsString(payload);
        if (json.getBytes(StandardCharsets.UTF_8).length > MAX_DRAFT_BYTES) {
            throw new CvDraftValidationException("CV draft payload exceeds 256 KiB limit");
        }
        return json;
    }

    private CvDraft toDomain(CvDraftsRecord record) {
        List<String> keys = mapper.readValue(record.getSectionOrder().data(), SECTION_LIST_TYPE);
        List<CvDraftSection> sections = keys.stream().map(CvDraftSection::fromKey).toList();
        CvDraftPayload payload = mapper.readValue(record.getContentJson().data(), CvDraftPayload.class);
        return new CvDraft(
                record.getId(),
                record.getCandidateUserId(),
                record.getTitle(),
                CvDraftTemplate.fromKey(record.getTemplateId()),
                record.getAccentColor(),
                sections,
                payload,
                record.getCreatedAt(),
                record.getUpdatedAt(),
                record.getVersion()
        );
    }
}
