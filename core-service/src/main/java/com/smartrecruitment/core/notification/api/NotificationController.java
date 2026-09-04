package com.smartrecruitment.core.notification.api;

import com.smartrecruitment.core.notification.application.NotificationService;
import com.smartrecruitment.core.notification.domain.Notification;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) { this.notifications = notifications; }

    @GetMapping
    public NotificationFeedResponse feed(@AuthenticationPrincipal Jwt jwt,
                                         @RequestParam(defaultValue = "50") int limit) {
        var feed = notifications.feed(userId(jwt), limit);
        return new NotificationFeedResponse(feed.items().stream().map(NotificationResponse::from).toList(),
                feed.unreadCount());
    }

    @PatchMapping("/{notificationId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID notificationId,
                         @RequestParam long version) {
        notifications.markRead(userId(jwt), notificationId, version);
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllRead(@AuthenticationPrincipal Jwt jwt) { notifications.markAllRead(userId(jwt)); }

    private static UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record NotificationFeedResponse(List<NotificationResponse> items, long unreadCount) { }
    public record NotificationResponse(UUID notificationId, String type, String title, String message,
                                       String linkUrl, OffsetDateTime readAt, OffsetDateTime createdAt,
                                       long version) {
        static NotificationResponse from(Notification value) {
            return new NotificationResponse(value.publicId(), value.type(), value.title(), value.message(),
                    value.linkUrl(), value.readAt(), value.createdAt(), value.version());
        }
    }
}

