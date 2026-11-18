package com.smartrecruitment.core.notification.application.port;

import com.smartrecruitment.core.notification.domain.Notification;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;

public interface NotificationRepository {
    void insert(Long userId, String type, String title, String message, String linkUrl,
                String deduplicationKey, OffsetDateTime createdAt);
    void insertForActiveCompanyRecruiters(Long companyId, String type, String title, String message,
                                          String linkUrl, String deduplicationKey, OffsetDateTime createdAt);
    void insertForApplicationParticipants(Long applicationId, String type, String title, String message,
                                          String linkUrl, String deduplicationKey, OffsetDateTime createdAt);
    List<Notification> findAll(Long userId, int limit);
    default List<Notification> findAll(Long userId, int limit, boolean unreadOnly) {
        return findAll(userId, limit);
    }
    default List<Notification> findAll(Long userId, int limit, int offset, boolean unreadOnly,
                                       Collection<String> types) {
        return findAll(userId, limit, unreadOnly);
    }
    long countUnread(Long userId);
    default long countAll(Long userId) {
        return 0L;
    }
    default long countByTypes(Long userId, Collection<String> types) {
        return 0L;
    }
    default long countUnreadByTypes(Long userId, Collection<String> types) {
        return 0L;
    }
    boolean markRead(Long userId, Long notificationId, long expectedVersion, OffsetDateTime now);
    int markAllRead(Long userId, OffsetDateTime now);
}

