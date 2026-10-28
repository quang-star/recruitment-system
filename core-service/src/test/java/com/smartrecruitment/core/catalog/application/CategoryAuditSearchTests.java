package com.smartrecruitment.core.catalog.application;

import com.smartrecruitment.core.catalog.application.port.CategoryRepository;
import com.smartrecruitment.core.shared.application.PageResult;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CategoryAuditSearchTests {
    @Test
    void normalizesOptionalFiltersAndUsesExistingPaginationLimits() {
        var defaults = new CategoryAuditSearch(null, null, null, null, " \t ", null, null, null);
        assertThat(defaults.page()).isZero();
        assertThat(defaults.size()).isEqualTo(20);
        assertThat(defaults.action()).isNull();
        var search = new CategoryAuditSearch(3, 100, null, null, " defer ", null, null, null);
        assertThat(search.action()).isEqualTo("DEFER");
        assertThat(search.offset()).isEqualTo(300);
        for (int[] bounds : List.of(new int[] {-1, 20}, new int[] {100001, 20}, new int[] {0, 0}, new int[] {0, 101})) {
            assertThatThrownBy(() -> new CategoryAuditSearch(bounds[0], bounds[1], null, null, null, null, null, null))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void rejectsUnknownActionsAndReversedTimeRange() {
        var timestamp = OffsetDateTime.parse("2026-01-01T12:00:00Z");
        assertThatThrownBy(() -> new CategoryAuditSearch(0, 20, null, null, "UNKNOWN", null, null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CategoryAuditSearch(0, 20, null, null, null, null, timestamp.plusSeconds(1), timestamp))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(new CategoryAuditSearch(0, 20, null, null, null, null, timestamp, timestamp.withOffsetSameInstant(java.time.ZoneOffset.ofHours(7))))
                .isNotNull();
    }

    @Test
    void servicePassesValidatedSearchToItsOwningRepository() {
        var repository = mock(CategoryRepository.class);
        var search = new CategoryAuditSearch(0, 20, com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), "EDIT", java.util.UUID.randomUUID(), null, null);
        var page = new PageResult<CategoryRepository.CategoryChange>(List.of(), 0, 0, 20);
        when(repository.searchHistory(search)).thenReturn(page);
        assertThat(new CategoryService(repository).searchHistory(search)).isSameAs(page);
        verify(repository).searchHistory(search);
        verifyNoMoreInteractions(repository);
    }
}
