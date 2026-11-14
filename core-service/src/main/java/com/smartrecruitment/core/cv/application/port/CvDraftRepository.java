package com.smartrecruitment.core.cv.application.port;

import com.smartrecruitment.core.cv.domain.CvDraft;

import java.util.List;
import java.util.Optional;

public interface CvDraftRepository {
    long countOwned(Long candidateUserId);

    List<CvDraft> findAllOwned(Long candidateUserId);

    Optional<CvDraft> findOwned(Long candidateUserId, Long draftId);

    CvDraft insert(CvDraft draft);

    Optional<CvDraft> update(CvDraft draft, long expectedVersion);

    boolean deleteOwned(Long candidateUserId, Long draftId, long expectedVersion);
}
