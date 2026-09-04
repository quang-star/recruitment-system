package com.smartrecruitment.core.notification.application;

public class NotificationNotFoundException extends RuntimeException {
    public NotificationNotFoundException() { super("Notification was not found or changed"); }
}

