package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.application.port.CvDraftRepository;
import com.smartrecruitment.core.cv.domain.CvDraft;
import com.smartrecruitment.core.cv.domain.CvDraftPayload;
import com.smartrecruitment.core.cv.domain.CvDraftSection;
import com.smartrecruitment.core.cv.domain.CvDraftTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;

@Service
public class CvDraftService {
    private final CvDraftRepository drafts;
    private final Clock clock;

    public CvDraftService(CvDraftRepository drafts, Clock clock) {
        this.drafts = drafts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<CvDraft> listMine(Long candidateUserId) {
        return drafts.findAllOwned(candidateUserId);
    }

    @Transactional(readOnly = true)
    public CvDraft getMine(Long candidateUserId, Long draftId) {
        return drafts.findOwned(candidateUserId, draftId).orElseThrow(CvDraftNotFoundException::new);
    }

    @Transactional
    public CvDraft create(Long candidateUserId, String title, CvDraftTemplate templateId,
                          String accentColor, List<CvDraftSection> sectionOrder, CvDraftPayload payload) {
        if (drafts.countOwned(candidateUserId) >= CvDraft.MAX_DRAFTS_PER_CANDIDATE) {
            throw new CvDraftValidationException(
                    "Maximum " + CvDraft.MAX_DRAFTS_PER_CANDIDATE + " CV drafts reached");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        try {
            var draft = CvDraft.create(candidateUserId, title, templateId, accentColor, sectionOrder, payload, now);
            return drafts.insert(draft);
        } catch (IllegalArgumentException exception) {
            throw new CvDraftValidationException(exception.getMessage());
        }
    }

    @Transactional
    public CvDraft update(Long candidateUserId, Long draftId, long expectedVersion, String title,
                          CvDraftTemplate templateId, String accentColor,
                          List<CvDraftSection> sectionOrder, CvDraftPayload payload) {
        var existing = drafts.findOwned(candidateUserId, draftId).orElseThrow(CvDraftNotFoundException::new);
        if (existing.version() != expectedVersion) {
            throw new CvDraftConflictException();
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        CvDraft next;
        try {
            next = new CvDraft(existing.id(), existing.candidateUserId(), title, templateId, accentColor,
                    sectionOrder, payload, existing.createdAt(),
                    now.isBefore(existing.createdAt()) ? existing.createdAt() : now, existing.version());
        } catch (IllegalArgumentException exception) {
            throw new CvDraftValidationException(exception.getMessage());
        }
        return drafts.update(next, expectedVersion).orElseThrow(CvDraftConflictException::new);
    }

    @Transactional
    public void delete(Long candidateUserId, Long draftId, long expectedVersion) {
        var existing = drafts.findOwned(candidateUserId, draftId).orElseThrow(CvDraftNotFoundException::new);
        if (existing.version() != expectedVersion) {
            throw new CvDraftConflictException();
        }
        if (!drafts.deleteOwned(candidateUserId, draftId, expectedVersion)) {
            throw new CvDraftConflictException();
        }
    }
}
