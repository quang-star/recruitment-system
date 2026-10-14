package com.smartrecruitment.core.notification.domain;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

public record Notification(UUID publicId, UUID userId, String type, String title, String message,
                           String linkUrl, OffsetDateTime readAt, OffsetDateTime createdAt, long version) {
    public Notification {
        Objects.requireNonNull(publicId, "publicId");
        Objects.requireNonNull(userId, "userId");
        if (type == null || type.isBlank() || title == null || title.isBlank()
                || message == null || message.isBlank()) {
            throw new IllegalArgumentException("Notification content is required");
        }
        Objects.requireNonNull(createdAt, "createdAt");
        if (version < 0) throw new IllegalArgumentException("Notification version must not be negative");
    }

    public boolean unread() { return readAt == null; }
}

