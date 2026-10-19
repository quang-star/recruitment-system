package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.application.application.ApplicationConflictException;
import com.smartrecruitment.core.cv.application.port.CvPrivacyRepository;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.cv.domain.CvStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

@Service
public class CvPrivacyService {
    private final CvPrivacyRepository cvs;
    private final OutboxEventRepository outbox;

    public CvPrivacyService(CvPrivacyRepository cvs, OutboxEventRepository outbox) {
        this.cvs = cvs;
        this.outbox = outbox;
    }

    @Transactional
    public void delete(UUID owner, UUID cvId, long expectedVersion) {
        var cv = cvs.lockOwned(owner, cvId).orElseThrow(CandidateCvNotFoundException::new);
        if (cv.status() == CvStatus.DELETED) return;
        if (expectedVersion != cv.version()) {
            throw new ApplicationConflictException("CV changed; reload before deleting");
        }
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        for (UUID versionId : cvs.eraseLocked(cvId, now)) {
            outbox.append(new PrivacyEvent("cv.deleted.v1", versionId,
                    Map.of("cvId", cvId, "cvVersionId", versionId), UUID.randomUUID(), now));
        }
    }
}
