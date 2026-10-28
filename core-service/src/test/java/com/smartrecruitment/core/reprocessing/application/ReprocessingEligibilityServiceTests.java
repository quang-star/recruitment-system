package com.smartrecruitment.core.reprocessing.application;

import com.smartrecruitment.core.reprocessing.application.port.ReprocessingEligibilityRepository;
import com.smartrecruitment.core.reprocessing.application.port.ReprocessingEligibilityRepository.Reason;
import org.junit.jupiter.api.Test;
import static com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck.Operation.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReprocessingEligibilityServiceTests {
    @Test
    void requiresExpectedParseIdentityAndBothMatchingSnapshotIds() {
        Long id = com.smartrecruitment.core.support.TestIds.next();
        for (var operation : new ReprocessingEligibilityCheck.Operation[]{PARSE_CV, PARSE_JD}) {
            assertThatThrownBy(() -> new ReprocessingEligibilityCheck(operation, id, null, "a".repeat(64), null, null))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> new ReprocessingEligibilityCheck(operation, id, id, null, null, null))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> new ReprocessingEligibilityCheck(operation, id, id, "bad-hash", null, null))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> new ReprocessingEligibilityCheck(MATCH_APPLICATION, id, null, null, id, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ReprocessingEligibilityCheck(MATCH_APPLICATION, id, null, null, null, id))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void onlyLiveAuthoritativeChecksAreEligible() {
        var repository = mock(ReprocessingEligibilityRepository.class);
        var service = new ReprocessingEligibilityService(repository);
        var check = new ReprocessingEligibilityCheck(PARSE_CV, com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), "a".repeat(64), null, null);
        for (Reason reason : Reason.values()) {
            when(repository.check(check)).thenReturn(reason);
            assertThat(service.check(check)).isEqualTo(new ReprocessingEligibilityService.Eligibility(reason == Reason.LIVE, reason));
        }
    }
}
