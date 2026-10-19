package com.smartrecruitment.core.notification.application;

import com.smartrecruitment.core.notification.application.port.NotificationRepository;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class NotificationServiceTests {
    @Test
    void matchingNotificationDoesNotPersistARevocableScore() {
        var repository = mock(NotificationRepository.class);
        var service = new NotificationService(repository, Clock.systemUTC());
        UUID application = UUID.randomUUID(), result = UUID.randomUUID();
        service.matchingCompleted(application, result, 87.4);
        verify(repository).insertForApplicationParticipants(eq(application), eq("MATCHING_COMPLETED"),
                eq("Đã có kết quả đối sánh"), eq("Mở hồ sơ ứng tuyển để xem kết quả khi quyền chia sẻ còn hiệu lực."),
                eq("/"), eq("matching-completed:" + result), any());
    }

}
