package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyReviewRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CompanyReviewServiceTests {
    private final CompanyReviewRepository repository = mock(CompanyReviewRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-13T00:00:00Z"), ZoneOffset.UTC);
    private final CompanyReviewService service = new CompanyReviewService(repository, clock);

    @Test
    void approvesTheShownVersionWithNormalizedReasonAndAuditMetadata() {
        var correlation = UUID.randomUUID();
        when(repository.findById(3L)).thenReturn(Optional.of(company(CompanyStatus.PENDING, 4)));
        when(repository.approvePending(eq(3L), eq(4L), eq(9L), eq("Reviewed"), eq(correlation), any()))
                .thenReturn(Optional.of(company(CompanyStatus.ACTIVE, 5)));
        var approved = service.approve(9L, 3L, 4, "  Reviewed  ", correlation);
        assertThat(approved.status()).isEqualTo(CompanyStatus.ACTIVE);
        assertThat(approved.verificationStatus()).isEqualTo(CompanyVerificationStatus.UNVERIFIED);
        verify(repository).approvePending(3L, 4, 9L, "Reviewed", correlation, java.time.OffsetDateTime.now(clock));
    }

    @ParameterizedTest
    @EnumSource(value = CompanyStatus.class, names = {"ACTIVE", "SUSPENDED", "CLOSED"})
    void rejectsNonPendingCompanies(CompanyStatus status) {
        when(repository.findById(3L)).thenReturn(Optional.of(company(status, 4)));
        assertThatThrownBy(() -> service.approve(9L, 3L, 4, "Reviewed", UUID.randomUUID()))
                .isInstanceOf(CompanyConflictException.class);
        verify(repository, never()).approvePending(any(), anyLong(), any(), anyString(), any(), any());
    }

    @Test
    void rejectsStaleVersionsAndConcurrentChangesWithoutRetrying() {
        when(repository.findById(3L)).thenReturn(Optional.of(company(CompanyStatus.PENDING, 4)));
        assertThatThrownBy(() -> service.approve(9L, 3L, 3, "Reviewed", UUID.randomUUID()))
                .isInstanceOf(CompanyConflictException.class);
        when(repository.approvePending(any(), anyLong(), any(), anyString(), any(), any())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.approve(9L, 3L, 4, "Reviewed", UUID.randomUUID()))
                .isInstanceOf(CompanyConflictException.class);
        verify(repository, times(1)).approvePending(any(), anyLong(), any(), anyString(), any(), any());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void requiresAReason(String reason) {
        assertThatThrownBy(() -> service.approve(9L, 3L, 4, reason, UUID.randomUUID())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.reject(9L, 3L, 4, reason, UUID.randomUUID())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.suspend(9L, 3L, 4, reason, UUID.randomUUID())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.reactivate(9L, 3L, 4, reason, UUID.randomUUID())).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(repository);
    }

    @Test
    void rejectsPendingSuspendsActiveAndReactivatesSuspendedWithExpectedStatusGuards() {
        var corr1 = UUID.randomUUID();
        when(repository.findById(3L)).thenReturn(Optional.of(company(CompanyStatus.PENDING, 4)));
        when(repository.transitionStatus(eq(3L), eq(CompanyStatus.PENDING), eq(CompanyStatus.CLOSED), eq("REJECT"),
                eq(4L), eq(9L), eq("Spam profile"), eq(corr1), any()))
                .thenReturn(Optional.of(company(CompanyStatus.CLOSED, 5)));
        assertThat(service.reject(9L, 3L, 4, "  Spam profile  ", corr1).status()).isEqualTo(CompanyStatus.CLOSED);

        var corr2 = UUID.randomUUID();
        when(repository.findById(3L)).thenReturn(Optional.of(company(CompanyStatus.ACTIVE, 5)));
        when(repository.transitionStatus(eq(3L), eq(CompanyStatus.ACTIVE), eq(CompanyStatus.SUSPENDED), eq("SUSPEND"),
                eq(5L), eq(9L), eq("Policy violation"), eq(corr2), any()))
                .thenReturn(Optional.of(company(CompanyStatus.SUSPENDED, 6)));
        assertThat(service.suspend(9L, 3L, 5, "Policy violation", corr2).status()).isEqualTo(CompanyStatus.SUSPENDED);

        var corr3 = UUID.randomUUID();
        when(repository.findById(3L)).thenReturn(Optional.of(company(CompanyStatus.SUSPENDED, 6)));
        when(repository.transitionStatus(eq(3L), eq(CompanyStatus.SUSPENDED), eq(CompanyStatus.ACTIVE), eq("REACTIVATE"),
                eq(6L), eq(9L), eq("Resolved"), eq(corr3), any()))
                .thenReturn(Optional.of(company(CompanyStatus.ACTIVE, 7)));
        assertThat(service.reactivate(9L, 3L, 6, "Resolved", corr3).status()).isEqualTo(CompanyStatus.ACTIVE);

        when(repository.findById(3L)).thenReturn(Optional.of(company(CompanyStatus.PENDING, 4)));
        assertThatThrownBy(() -> service.suspend(9L, 3L, 4, "Invalid state", UUID.randomUUID()))
                .isInstanceOf(CompanyConflictException.class);
        when(repository.findById(3L)).thenReturn(Optional.of(company(CompanyStatus.ACTIVE, 5)));
        assertThatThrownBy(() -> service.reactivate(9L, 3L, 5, "Invalid state", UUID.randomUUID()))
                .isInstanceOf(CompanyConflictException.class);
    }

    static Company company(CompanyStatus status, long version) {
        return new Company(3L, "Synthetic Legal", "Synthetic Company", "synthetic-company", null, null, "VN",
                null, null, null, null, status, CompanyVerificationStatus.UNVERIFIED, 7L, version);
    }
}
