package com.smartrecruitment.core.catalog.application;

import com.smartrecruitment.core.catalog.application.port.CategoryRepository;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CategoryServiceTests {
    private final CategoryRepository repository = mock(CategoryRepository.class);
    private final CategoryService service = new CategoryService(repository);
    private final Long actor = com.smartrecruitment.core.support.TestIds.next();
    private final UUID correlation = UUID.randomUUID();

    @Test
    void requiresTrimmedNonemptyReasonsForEveryPublicMutationBeforeReadingOrWriting() {
        for (String reason : new String[] {null, "", " \t\n ", "x".repeat(1001)}) {
            assertThatThrownBy(() -> service.create(actor, CategoryKind.INDUSTRY, null, "Synthetic category", reason, correlation))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> service.act(actor, com.smartrecruitment.core.support.TestIds.next(), 0, "DEFER", null, null, reason, correlation))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(repository);
    }

    @Test
    void defersAndReopensWithoutChangingCategoryIdentityOrTopology() {
        var before = entry("PENDING", 2);
        when(repository.find(before.id())).thenReturn(Optional.of(before));
        when(repository.update(any(), any(), anyString(), eq(actor), anyString(), anyString(), eq(correlation))).thenReturn(true);
        var deferred = service.act(actor, before.id(), 2, "DEFER", null, null, "  Awaiting domain review  ", correlation);
        assertThat(deferred.status()).isEqualTo("DEFERRED");
        assertThat(deferred.version()).isEqualTo(3);
        assertThat(deferred.kind()).isEqualTo(before.kind());
        assertThat(deferred.parentId()).isEqualTo(before.parentId());
        assertThat(deferred.name()).isEqualTo(before.name());
        verify(repository).update(before, deferred, "synthetic category", actor, "DEFER", "Awaiting domain review", correlation);
        when(repository.find(before.id())).thenReturn(Optional.of(deferred));
        var reopened = service.act(actor, deferred.id(), 3, "REOPEN", null, null, "Review can resume", correlation);
        assertThat(reopened.status()).isEqualTo("PENDING");
        assertThat(reopened.version()).isEqualTo(4);
    }

    @Test
    void deferredParentAllowsRecruiterProposalsWhileAdminCreationStillRequiresApproval() {
        var industry = entry("DEFERRED", 3);
        when(repository.find(industry.id())).thenReturn(Optional.of(industry));
        when(repository.findByName(CategoryKind.SPECIALIZATION, industry.id(), "synthetic new group"))
                .thenReturn(Optional.empty());
        when(repository.insert(any(), anyString(), eq(actor), anyString(), isNull()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var proposed = service.propose(actor, CategoryKind.SPECIALIZATION, industry.id(), "Synthetic new group");
        assertThat(proposed.status()).isEqualTo("PENDING");
        assertThat(proposed.parentId()).isEqualTo(industry.id());
        assertThatThrownBy(() -> service.create(actor, CategoryKind.SPECIALIZATION, industry.id(),
                "Synthetic approved group", "Synthetic Admin review", correlation))
                .isInstanceOf(IllegalArgumentException.class);
        verify(repository, times(1)).insert(any(), anyString(), eq(actor), anyString(), isNull());
    }

    @Test
    void rejectsWrongTransitionsAndDeferredReviewsWithoutWriting() {
        for (String[] stateAction : List.of(
                new String[] {"ACTIVE", "DEFER"}, new String[] {"PENDING", "REOPEN"},
                new String[] {"DEFERRED", "APPROVE"}, new String[] {"DEFERRED", "REJECT"},
                new String[] {"DEFERRED", "EDIT"}, new String[] {"DEFERRED", "MERGE"})) {
            var before = entry(stateAction[0], 0);
            when(repository.find(before.id())).thenReturn(Optional.of(before));
            assertThatThrownBy(() -> service.act(actor, before.id(), 0, stateAction[1], "Changed", com.smartrecruitment.core.support.TestIds.next(), "Synthetic review", correlation))
                    .isInstanceOf(CategoryConflictException.class);
        }
        verify(repository, never()).update(any(), any(), anyString(), any(), anyString(), anyString(), any());
    }

    @Test
    void approvesAnEditedNameInOneVersionedMutationWithItsReason() {
        var before = entry("PENDING", 0);
        when(repository.find(before.id())).thenReturn(Optional.of(before));
        when(repository.update(any(), any(), anyString(), eq(actor), eq("APPROVE"), anyString(), eq(correlation))).thenReturn(true);
        var approved = service.act(actor, before.id(), 0, "APPROVE", "  Reviewed   category ", null, "Terminology verified", correlation);
        assertThat(approved.name()).isEqualTo("Reviewed category");
        assertThat(approved.status()).isEqualTo("ACTIVE");
        assertThat(approved.version()).isOne();
        verify(repository).update(before, approved, "reviewed category", actor, "APPROVE", "Terminology verified", correlation);
    }

    @Test
    void staleRevisionAndLosingCompareAndSetCannotWriteAnotherAudit() {
        var before = entry("PENDING", 4);
        when(repository.find(before.id())).thenReturn(Optional.of(before));
        assertThatThrownBy(() -> service.act(actor, before.id(), 3, "DEFER", null, null, "Stale review", correlation))
                .isInstanceOf(CategoryConflictException.class);
        verify(repository, never()).update(any(), any(), anyString(), any(), anyString(), anyString(), any());
        assertThatThrownBy(() -> service.act(actor, before.id(), 4, "DEFER", null, null, "Concurrent review", correlation))
                .isInstanceOf(CategoryConflictException.class);
    }

    @Test
    void proposalUsesTruthfulSystemReasonAndDoesNotInventCorrelation() {
        when(repository.findByName(CategoryKind.INDUSTRY, null, "synthetic proposal")).thenReturn(Optional.empty());
        when(repository.insert(any(), anyString(), eq(actor), anyString(), isNull())).thenAnswer(call -> call.getArgument(0));
        var proposal = service.propose(actor, CategoryKind.INDUSTRY, null, "Synthetic proposal");
        assertThat(proposal.status()).isEqualTo("PENDING");
        verify(repository).insert(eq(proposal), eq("synthetic proposal"), eq(actor),
                eq("Đề xuất từ phân loại nghề do recruiter nhập cho Job."), isNull());
    }

    private CategoryEntry entry(String status, long version) {
        return new CategoryEntry(com.smartrecruitment.core.support.TestIds.next(), CategoryKind.INDUSTRY, null, "Synthetic category", status, null, version);
    }
}
