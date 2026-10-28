package com.smartrecruitment.core.application.domain;

import java.time.OffsetDateTime;

public record ApplicationStatusChange(Long id, ApplicationStatus fromStatus, ApplicationStatus toStatus,
                                      Long actorUserId, String reason, OffsetDateTime occurredAt) {
    public ApplicationStatusChange {
        if (id == null || toStatus == null || actorUserId == null || occurredAt == null) {
            throw new IllegalArgumentException("Application status history is incomplete");
        }
    }
}
