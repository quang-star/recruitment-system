package com.smartrecruitment.core.application.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ApplicationStatusChange(UUID publicId, ApplicationStatus fromStatus, ApplicationStatus toStatus,
                                      UUID actorUserId, String reason, OffsetDateTime occurredAt) {
    public ApplicationStatusChange {
        if (publicId == null || toStatus == null || actorUserId == null || occurredAt == null) {
            throw new IllegalArgumentException("Application status history is incomplete");
        }
    }
}
