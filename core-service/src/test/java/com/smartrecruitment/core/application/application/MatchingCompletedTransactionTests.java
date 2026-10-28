package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.infrastructure.messaging.MatchingCompletedListener;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import com.smartrecruitment.core.notification.application.NotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import tools.jackson.databind.ObjectMapper;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MatchingCompletedTransactionTests {
    @Test
    void notificationFailureRollsBackAndReplayCommits() {
        var projections = mock(JooqApplicationMatchingProjectionRepository.class);
        var notifications = mock(NotificationService.class);
        when(projections.update(any(), any(), any(), any(), anyString(), anyDouble(),
                anyString(), anyString(), anyString(), anyString(), isNull(), isNull())).thenReturn(true);
        doThrow(new IllegalStateException("temporary failure")).doNothing()
                .when(notifications).matchingCompleted(any(), any(), anyDouble());
        var manager = mock(PlatformTransactionManager.class);
        var first = mock(TransactionStatus.class);
        var second = mock(TransactionStatus.class);
        when(manager.getTransaction(any())).thenReturn(first, second);
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxyFactory = new ProxyFactory(new MatchingCompletedListener(projections, new ObjectMapper(), notifications));
        proxyFactory.addAdvice(interceptor);
        var listener = (MatchingCompletedListener) proxyFactory.getProxy();
        String id = "9007199254740993";
        String event = """
                {"eventType":"matching.completed.v2","payload":{
                  "applicationId":"%s","cvVersionId":"%s","jobVersionId":"%s",
                  "matchingResultId":"%s","status":"COMPLETED","finalScore":80,
                  "algorithmVersion":"baseline-v3","taxonomyVersion":"1.0.0",
                  "qualityFlags":[],"components":[],"claims":[]}}
                """.formatted(id, id, id, id);
        assertThatThrownBy(() -> listener.onMessage(event)).isInstanceOf(RuntimeException.class);
        verify(manager).rollback(first);
        listener.onMessage(event);
        verify(manager).commit(second);
        verify(notifications, times(2)).matchingCompleted(any(), any(), eq(80.0));
    }
}
