package com.smartrecruitment.core.application.api.dto;

import com.smartrecruitment.core.application.domain.ApplicationStatusChange;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ApplicationStatusChangeResponse(UUID statusChangeId, String fromStatus, String toStatus,
                                              UUID actorUserId, String reason, OffsetDateTime occurredAt) {
    public static ApplicationStatusChangeResponse from(ApplicationStatusChange change) {
        return new ApplicationStatusChangeResponse(change.publicId(),
                change.fromStatus() == null ? null : change.fromStatus().name(), change.toStatus().name(),
                change.actorUserId(), change.reason(), change.occurredAt());
    }
}
