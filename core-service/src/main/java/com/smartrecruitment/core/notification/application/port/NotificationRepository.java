package com.smartrecruitment.core.notification.application.port;

import com.smartrecruitment.core.notification.domain.Notification;

import java.time.OffsetDateTime;
import java.util.List;

public interface NotificationRepository {
    void insert(Long userId, String type, String title, String message, String linkUrl,
                String deduplicationKey, OffsetDateTime createdAt);
    void insertForActiveCompanyRecruiters(Long companyId, String type, String title, String message,
                                          String linkUrl, String deduplicationKey, OffsetDateTime createdAt);
    void insertForApplicationParticipants(Long applicationId, String type, String title, String message,
                                          String linkUrl, String deduplicationKey, OffsetDateTime createdAt);
    List<Notification> findAll(Long userId, int limit);
    long countUnread(Long userId);
    boolean markRead(Long userId, Long notificationId, long expectedVersion, OffsetDateTime now);
    int markAllRead(Long userId, OffsetDateTime now);
}

