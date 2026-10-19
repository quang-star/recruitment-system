package com.smartrecruitment.core.cv.infrastructure.messaging;

import com.smartrecruitment.core.cv.application.port.CvErasureRepository;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/** Erasure survives process restarts and temporary object-storage outages. */
@Component
public class CvErasureWorker {
    private final CvErasureRepository erasures;
    private final ObjectStorage storage;

    public CvErasureWorker(CvErasureRepository erasures, ObjectStorage storage) {
        this.erasures = erasures;
        this.storage = storage;
    }

    @Scheduled(fixedDelayString = "${core.cv-erasure.poll-delay-ms:5000}")
    @Transactional
    public void erasePending() {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var entries = erasures.claimPending(now, 10);
        for (var entry : entries) {
            try {
                storage.delete(entry.objectKey());
                erasures.markCompleted(entry.cvVersionId(), now);
            } catch (RuntimeException exception) {
                int attempts = Math.min(1_000_000, entry.attempts() + 1);
                erasures.scheduleRetry(entry.cvVersionId(), attempts,
                        now.plusSeconds(Math.min(300, 5L * attempts)));
            }
        }
    }
}
