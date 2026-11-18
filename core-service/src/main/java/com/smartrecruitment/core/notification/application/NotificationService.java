package com.smartrecruitment.core.notification.application;

import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.notification.application.port.NotificationRepository;
import com.smartrecruitment.core.notification.domain.Notification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;

@Service
public class NotificationService {
    public static final List<String> APPLICATION_TYPES = List.of(
            "APPLICATION_SUBMITTED",
            "APPLICATION_STATUS_CHANGED",
            "APPLICATION_WITHDRAWN"
    );

    private final NotificationRepository notifications;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, Clock clock) {
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public NotificationFeed feed(Long userId, int requestedLimit) {
        return feed(userId, requestedLimit, 0, false, false);
    }

    @Transactional(readOnly = true)
    public NotificationFeed feed(Long userId, int requestedLimit, boolean unreadOnly) {
        return feed(userId, requestedLimit, 0, unreadOnly, false);
    }

    @Transactional(readOnly = true)
    public NotificationFeed feed(Long userId, int requestedLimit, int requestedOffset,
                                 boolean unreadOnly, boolean applicationsOnly) {
        int limit = Math.max(1, Math.min(requestedLimit, 100));
        int offset = Math.max(0, requestedOffset);
        List<Notification> items = (offset == 0 && !applicationsOnly)
                ? notifications.findAll(userId, limit, unreadOnly)
                : notifications.findAll(userId, limit, offset, unreadOnly,
                        applicationsOnly ? APPLICATION_TYPES : List.of());
        long unreadCount = notifications.countUnread(userId);
        long totalCount = notifications.countAll(userId);
        long applicationCount = notifications.countByTypes(userId, APPLICATION_TYPES);
        long filteredTotal = unreadOnly && applicationsOnly
                ? notifications.countUnreadByTypes(userId, APPLICATION_TYPES)
                : unreadOnly ? unreadCount : applicationsOnly ? applicationCount : totalCount;
        boolean hasMore = (long) offset + items.size() < filteredTotal;
        return new NotificationFeed(items, unreadCount, totalCount, applicationCount, hasMore);
    }

    @Transactional
    public void markRead(Long userId, Long notificationId, long expectedVersion) {
        if (!notifications.markRead(userId, notificationId, expectedVersion, OffsetDateTime.now(clock))) {
            throw new NotificationNotFoundException();
        }
    }

    @Transactional
    public void markAllRead(Long userId) {
        notifications.markAllRead(userId, OffsetDateTime.now(clock));
    }

    public void applicationSubmitted(Application application) {
        notifications.insertForActiveCompanyRecruiters(application.companyId(), "APPLICATION_SUBMITTED",
                "Có hồ sơ ứng tuyển mới", "Một ứng viên vừa nộp hồ sơ vào tin tuyển dụng của công ty.",
                recruiterApplicationLink(application), "application-submitted:" + application.id(), OffsetDateTime.now(clock));
    }

    public void applicationWithdrawn(Application application) {
        notifications.insertForActiveCompanyRecruiters(application.companyId(), "APPLICATION_WITHDRAWN",
                "Ứng viên đã rút hồ sơ", "Một hồ sơ ứng tuyển đã được rút; quyền xem CV đã kết thúc.",
                recruiterApplicationLink(application), "application-withdrawn:" + application.id(), OffsetDateTime.now(clock));
    }

    private String recruiterApplicationLink(Application application) {
        return "/recruiter/jobs/" + application.jobId() + "?application=" + application.id();
    }

    public void applicationStatusChanged(Application application) {
        String label = switch (application.status()) {
            case SUBMITTED -> "Đã nộp hồ sơ";
            case UNDER_REVIEW -> "Đang xem xét";
            case SHORTLISTED -> "Vào danh sách rút gọn (Shortlist)";
            case INTERVIEW -> "Đang phỏng vấn";
            case OFFERED -> "Đã gửi đề nghị tuyển dụng";
            case HIRED -> "Đã tuyển dụng";
            case REJECTED -> "Chưa phù hợp";
            case WITHDRAWN -> "Đã rút hồ sơ";
        };
        notifications.insert(application.candidateUserId(), "APPLICATION_STATUS_CHANGED",
                "Trạng thái ứng tuyển đã thay đổi", "Hồ sơ của bạn hiện ở trạng thái: " + label + ".",
                "/candidate/applications?application=" + application.id(), "application-status:" + application.id() + ":" + application.version(),
                OffsetDateTime.now(clock));
    }

    public void matchingCompleted(Long applicationId, Long matchingResultId, double score) {
        notifications.insertForApplicationParticipants(applicationId, "MATCHING_COMPLETED",
                "Đã có kết quả đối sánh", "Mở hồ sơ ứng tuyển để xem kết quả khi quyền chia sẻ còn hiệu lực.",
                "/candidate/applications?application=" + applicationId, "matching-completed:" + matchingResultId, OffsetDateTime.now(clock));
    }

    public void invitationAccepted(Long inviterUserId, Long invitationId, String email) {
        notifications.insert(inviterUserId, "COMPANY_INVITATION_ACCEPTED", "Lời mời công ty đã được chấp nhận",
                email + " đã tham gia công ty.", "/recruiter/company?tab=team", "company-invitation-accepted:" + invitationId,
                OffsetDateTime.now(clock));
    }

    public record NotificationFeed(List<Notification> items, long unreadCount,
                                   long totalCount, long applicationCount, boolean hasMore) {
        public NotificationFeed(List<Notification> items, long unreadCount) {
            this(items, unreadCount, items.size(), 0L, false);
        }
    }
}
