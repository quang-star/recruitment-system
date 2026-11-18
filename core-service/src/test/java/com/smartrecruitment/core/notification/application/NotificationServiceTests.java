package com.smartrecruitment.core.notification.application;

import com.smartrecruitment.core.notification.application.port.NotificationRepository;
import com.smartrecruitment.core.notification.domain.Notification;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class NotificationServiceTests {
    @Test
    void matchingNotificationDoesNotPersistARevocableScore() {
        var repository = mock(NotificationRepository.class);
        var service = new NotificationService(repository, Clock.systemUTC());
        Long application = com.smartrecruitment.core.support.TestIds.next(), result = com.smartrecruitment.core.support.TestIds.next();
        service.matchingCompleted(application, result, 87.4);
        verify(repository).insertForApplicationParticipants(eq(application), eq("MATCHING_COMPLETED"),
                eq("Đã có kết quả đối sánh"), eq("Mở hồ sơ ứng tuyển để xem kết quả khi quyền chia sẻ còn hiệu lực."),
                eq("/candidate/applications?application=" + application), eq("matching-completed:" + result), any());
    }

    @Test
    void applicationSubmittedInsertsNotificationForCompanyRecruiters() {
        var repository = mock(NotificationRepository.class);
        var service = new NotificationService(repository, Clock.systemUTC());
        Long candidate = com.smartrecruitment.core.support.TestIds.next(), company = com.smartrecruitment.core.support.TestIds.next(), app = com.smartrecruitment.core.support.TestIds.next();
        var application = new com.smartrecruitment.core.application.domain.Application(
                app, candidate, company, com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(),
                com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), null,
                com.smartrecruitment.core.application.domain.ApplicationStatus.SUBMITTED,
                com.smartrecruitment.core.application.domain.ApplicationSource.DIRECT,
                java.time.OffsetDateTime.now(), java.time.OffsetDateTime.now(), 0L);
        service.applicationSubmitted(application);
        verify(repository).insertForActiveCompanyRecruiters(eq(company), eq("APPLICATION_SUBMITTED"),
                eq("Có hồ sơ ứng tuyển mới"), anyString(), eq("/recruiter/jobs/" + application.jobId() + "?application=" + app), eq("application-submitted:" + app), any());
        service.applicationWithdrawn(application);
        verify(repository).insertForActiveCompanyRecruiters(eq(company), eq("APPLICATION_WITHDRAWN"),
                anyString(), anyString(), eq("/recruiter/jobs/" + application.jobId() + "?application=" + app),
                eq("application-withdrawn:" + app), any());
    }

    @Test
    void applicationStatusChangedInsertsNotificationWithVietnameseLabelForCandidate() {
        var repository = mock(NotificationRepository.class);
        var service = new NotificationService(repository, Clock.systemUTC());
        Long candidate = com.smartrecruitment.core.support.TestIds.next(), company = com.smartrecruitment.core.support.TestIds.next(), app = com.smartrecruitment.core.support.TestIds.next();
        var application = new com.smartrecruitment.core.application.domain.Application(
                app, candidate, company, com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(),
                com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), null,
                com.smartrecruitment.core.application.domain.ApplicationStatus.SHORTLISTED,
                com.smartrecruitment.core.application.domain.ApplicationSource.DIRECT,
                java.time.OffsetDateTime.now(), java.time.OffsetDateTime.now(), 1L);
        service.applicationStatusChanged(application);
        verify(repository).insert(eq(candidate), eq("APPLICATION_STATUS_CHANGED"),
                eq("Trạng thái ứng tuyển đã thay đổi"), contains("Vào danh sách rút gọn (Shortlist)"),
                eq("/candidate/applications?application=" + app), eq("application-status:" + app + ":1"), any());
    }

    @Test
    void unreadOnlyFeedPassesFilterToRepositoryAndClampsLimit() {
        var repository = mock(NotificationRepository.class);
        var service = new NotificationService(repository, Clock.systemUTC());
        Long userId = com.smartrecruitment.core.support.TestIds.next();
        when(repository.findAll(userId, 30, true)).thenReturn(java.util.List.of());
        when(repository.countUnread(userId)).thenReturn(4L);

        var feed = service.feed(userId, 30, true);

        org.assertj.core.api.Assertions.assertThat(feed.unreadCount()).isEqualTo(4L);
        verify(repository).findAll(userId, 30, true);
    }

    @Test
    void feedReturnsGlobalCountsAndHasMoreAcrossOffsetAndApplicationsFilter() {
        var repository = mock(NotificationRepository.class);
        var service = new NotificationService(repository, Clock.systemUTC());
        Long userId = com.smartrecruitment.core.support.TestIds.next();
        var item = new Notification(101L, userId, "APPLICATION_SUBMITTED", "Có hồ sơ mới",
                "Ứng viên mới", "/recruiter/jobs/1?application=9", null, OffsetDateTime.now(ZoneOffset.UTC), 0L);

        when(repository.findAll(userId, 30, 30, false, NotificationService.APPLICATION_TYPES)).thenReturn(List.of(item));
        when(repository.countUnread(userId)).thenReturn(58L);
        when(repository.countAll(userId)).thenReturn(72L);
        when(repository.countByTypes(userId, NotificationService.APPLICATION_TYPES)).thenReturn(41L);

        var feed = service.feed(userId, 30, 30, false, true);

        assertThat(feed.items()).containsExactly(item);
        assertThat(feed.unreadCount()).isEqualTo(58L);
        assertThat(feed.totalCount()).isEqualTo(72L);
        assertThat(feed.applicationCount()).isEqualTo(41L);
        assertThat(feed.hasMore()).isTrue();
    }

    @Test
    void invitationAcceptedLinksDirectlyToCompanyTeamTab() {
        var repository = mock(NotificationRepository.class);
        var service = new NotificationService(repository, Clock.systemUTC());
        Long inviter = com.smartrecruitment.core.support.TestIds.next();
        Long invitationId = com.smartrecruitment.core.support.TestIds.next();

        service.invitationAccepted(inviter, invitationId, "new.recruiter@company.test");

        verify(repository).insert(eq(inviter), eq("COMPANY_INVITATION_ACCEPTED"),
                eq("Lời mời công ty đã được chấp nhận"), contains("new.recruiter@company.test"),
                eq("/recruiter/company?tab=team"), eq("company-invitation-accepted:" + invitationId), any());
    }
}
