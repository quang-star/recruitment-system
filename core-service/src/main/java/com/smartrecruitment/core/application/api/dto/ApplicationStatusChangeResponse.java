package com.smartrecruitment.core.application.api.dto;

import com.smartrecruitment.core.application.domain.ApplicationStatusChange;

import java.time.OffsetDateTime;

public record ApplicationStatusChangeResponse(Long statusChangeId, String fromStatus, String toStatus,
                                              Long actorUserId, String reason, OffsetDateTime occurredAt) {
    public static ApplicationStatusChangeResponse from(ApplicationStatusChange change) {
        return new ApplicationStatusChangeResponse(change.id(),
                change.fromStatus() == null ? null : change.fromStatus().name(), change.toStatus().name(),
                change.actorUserId(), change.reason(), change.occurredAt());
    }
}
