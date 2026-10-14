package com.smartrecruitment.core.notification.application;

import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.notification.application.port.NotificationRepository;
import com.smartrecruitment.core.notification.domain.Notification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class NotificationService {
    private final NotificationRepository notifications;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, Clock clock) {
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public NotificationFeed feed(UUID userId, int requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit, 100));
        return new NotificationFeed(notifications.findAll(userId, limit), notifications.countUnread(userId));
    }

    @Transactional
    public void markRead(UUID userId, UUID notificationId, long expectedVersion) {
        if (!notifications.markRead(userId, notificationId, expectedVersion, OffsetDateTime.now(clock))) {
            throw new NotificationNotFoundException();
        }
    }

    @Transactional
    public void markAllRead(UUID userId) {
        notifications.markAllRead(userId, OffsetDateTime.now(clock));
    }

    public void applicationSubmitted(Application application) {
        notifications.insertForActiveCompanyRecruiters(application.companyId(), "APPLICATION_SUBMITTED",
                "Có hồ sơ ứng tuyển mới", "Một ứng viên vừa nộp hồ sơ vào tin tuyển dụng của công ty.",
                "/", "application-submitted:" + application.publicId(), OffsetDateTime.now(clock));
    }

    public void applicationStatusChanged(Application application) {
        notifications.insert(application.candidateUserId(), "APPLICATION_STATUS_CHANGED",
                "Trạng thái ứng tuyển đã thay đổi", "Hồ sơ của bạn hiện ở trạng thái " + application.status() + ".",
                "/", "application-status:" + application.publicId() + ":" + application.version(),
                OffsetDateTime.now(clock));
    }

    public void matchingCompleted(UUID applicationId, UUID matchingResultId, double score) {
        notifications.insertForApplicationParticipants(applicationId, "MATCHING_COMPLETED",
                "Đã có kết quả đối sánh", "Điểm phù hợp mới nhất là " + String.format(java.util.Locale.ROOT, "%.1f", score) + "/100.",
                "/", "matching-completed:" + matchingResultId, OffsetDateTime.now(clock));
    }

    public void invitationAccepted(UUID inviterUserId, UUID invitationId, String email) {
        notifications.insert(inviterUserId, "COMPANY_INVITATION_ACCEPTED", "Lời mời công ty đã được chấp nhận",
                email + " đã tham gia công ty.", "/", "company-invitation-accepted:" + invitationId,
                OffsetDateTime.now(clock));
    }

    public record NotificationFeed(List<Notification> items, long unreadCount) { }
}

