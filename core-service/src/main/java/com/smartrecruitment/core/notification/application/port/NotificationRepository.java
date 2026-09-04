package com.smartrecruitment.core.notification.application.port;

import com.smartrecruitment.core.notification.domain.Notification;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface NotificationRepository {
    void insert(UUID userId, String type, String title, String message, String linkUrl,
                String deduplicationKey, OffsetDateTime createdAt);
    void insertForActiveCompanyRecruiters(UUID companyId, String type, String title, String message,
                                          String linkUrl, String deduplicationKey, OffsetDateTime createdAt);
    void insertForApplicationParticipants(UUID applicationId, String type, String title, String message,
                                          String linkUrl, String deduplicationKey, OffsetDateTime createdAt);
    List<Notification> findAll(UUID userId, int limit);
    long countUnread(UUID userId);
    boolean markRead(UUID userId, UUID notificationId, long expectedVersion, OffsetDateTime now);
    int markAllRead(UUID userId, OffsetDateTime now);
}

