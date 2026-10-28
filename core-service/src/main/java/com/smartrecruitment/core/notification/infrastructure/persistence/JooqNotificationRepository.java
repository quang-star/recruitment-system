package com.smartrecruitment.core.notification.infrastructure.persistence;

import com.smartrecruitment.core.notification.application.port.NotificationRepository;
import com.smartrecruitment.core.notification.domain.Notification;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Notifications.NOTIFICATIONS;

@Repository
public class JooqNotificationRepository implements NotificationRepository {
    private final DSLContext dsl;

    public JooqNotificationRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public void insert(Long userId, String type, String title, String message, String linkUrl,
                       String deduplicationKey, OffsetDateTime createdAt) {
        dsl.insertInto(NOTIFICATIONS)

                .set(NOTIFICATIONS.USER_ID, userId)
                .set(NOTIFICATIONS.TYPE, type)
                .set(NOTIFICATIONS.TITLE, title)
                .set(NOTIFICATIONS.MESSAGE, message)
                .set(NOTIFICATIONS.LINK_URL, linkUrl)
                .set(NOTIFICATIONS.DEDUPLICATION_KEY, deduplicationKey + ":" + userId)
                .set(NOTIFICATIONS.CREATED_AT, createdAt)
                .set(NOTIFICATIONS.VERSION, 0L)
                .onConflict(NOTIFICATIONS.DEDUPLICATION_KEY).doNothing()
                .execute();
    }

    @Override
    public void insertForActiveCompanyRecruiters(Long companyId, String type, String title, String message,
                                                  String linkUrl, String key, OffsetDateTime createdAt) {
        dsl.select(COMPANY_MEMBERS.USER_ID).from(COMPANY_MEMBERS)
                .join(COMPANIES).on(COMPANIES.ID.eq(COMPANY_MEMBERS.COMPANY_ID))
                .where(COMPANIES.ID.eq(companyId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANY_MEMBERS.ROLE.in("OWNER", "COMPANY_ADMIN", "RECRUITER"))
                .fetch(COMPANY_MEMBERS.USER_ID)
                .forEach(userId -> insert(userId, type, title, message, linkUrl, key, createdAt));
    }

    @Override
    public void insertForApplicationParticipants(Long applicationId, String type, String title, String message,
                                                  String linkUrl, String key, OffsetDateTime createdAt) {
        Long candidate = dsl.select(APPLICATIONS.CANDIDATE_USER_ID).from(APPLICATIONS)
                .where(APPLICATIONS.ID.eq(applicationId)).fetchOne(APPLICATIONS.CANDIDATE_USER_ID);
        if (candidate == null) return;
        insert(candidate, type, title, message, linkUrl, key, createdAt);
        dsl.select(COMPANY_MEMBERS.USER_ID).from(COMPANY_MEMBERS)
                .join(APPLICATIONS).on(APPLICATIONS.COMPANY_ID.eq(COMPANY_MEMBERS.COMPANY_ID))
                .where(APPLICATIONS.ID.eq(applicationId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANY_MEMBERS.ROLE.in("OWNER", "COMPANY_ADMIN", "RECRUITER"))
                .fetch(COMPANY_MEMBERS.USER_ID)
                .forEach(userId -> insert(userId, type, title, message, linkUrl, key, createdAt));
    }

    @Override
    public List<Notification> findAll(Long userId, int limit) {
        return dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.USER_ID.eq(userId))
                .orderBy(NOTIFICATIONS.CREATED_AT.desc()).limit(limit).fetch(this::toDomain);
    }

    @Override
    public long countUnread(Long userId) {
        return dsl.fetchCount(dsl.selectOne().from(NOTIFICATIONS)
                .where(NOTIFICATIONS.USER_ID.eq(userId)).and(NOTIFICATIONS.READ_AT.isNull()));
    }

    @Override
    public boolean markRead(Long userId, Long notificationId, long expectedVersion, OffsetDateTime now) {
        return dsl.update(NOTIFICATIONS).set(NOTIFICATIONS.READ_AT, now)
                .set(NOTIFICATIONS.VERSION, NOTIFICATIONS.VERSION.plus(1L))
                .where(NOTIFICATIONS.ID.eq(notificationId)).and(NOTIFICATIONS.USER_ID.eq(userId))
                .and(NOTIFICATIONS.READ_AT.isNull()).and(NOTIFICATIONS.VERSION.eq(expectedVersion)).execute() == 1;
    }

    @Override
    public int markAllRead(Long userId, OffsetDateTime now) {
        return dsl.update(NOTIFICATIONS).set(NOTIFICATIONS.READ_AT, now)
                .set(NOTIFICATIONS.VERSION, NOTIFICATIONS.VERSION.plus(1L))
                .where(NOTIFICATIONS.USER_ID.eq(userId)).and(NOTIFICATIONS.READ_AT.isNull()).execute();
    }

    private Notification toDomain(
            com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.NotificationsRecord record) {
        return new Notification(record.getId(), record.getUserId(), record.getType(), record.getTitle(),
                record.getMessage(), record.getLinkUrl(), record.getReadAt(), record.getCreatedAt(), record.getVersion());
    }
}
