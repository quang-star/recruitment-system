package com.smartrecruitment.core.notification.application;

import com.smartrecruitment.core.notification.application.port.NotificationRepository;
import org.junit.jupiter.api.Test;
import java.time.Clock;
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
                eq("/"), eq("matching-completed:" + result), any());
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
                eq("Có hồ sơ ứng tuyển mới"), anyString(), eq("/"), eq("application-submitted:" + app), any());
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
                eq("Trạng thái ứng tuyển đã thay đổi"), contains("Được chọn vào vòng phỏng vấn"),
                eq("/"), eq("application-status:" + app + ":1"), any());
    }
}
