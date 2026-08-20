package com.smartrecruitment.core.candidate.domain;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CandidateProfileTests {
    @Test
    void normalizesProfileText() {
        CandidateProfile profile = CandidateProfile.create(UUID.randomUUID(), "  Nguyen Van A  ", " Backend ", " HCM ",
                ProfileVisibility.APPLICATION_ONLY);
        assertThat(profile.displayName()).isEqualTo("Nguyen Van A");
        assertThat(profile.headline()).isEqualTo("Backend");
        assertThat(profile.locationText()).isEqualTo("HCM");
    }

    @Test
    void rejectsBlankDisplayName() {
        assertThatThrownBy(() -> CandidateProfile.create(UUID.randomUUID(), " ", null, null,
                ProfileVisibility.APPLICATION_ONLY))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void preservesRequestedVisibilityWhenCreated() {
        CandidateProfile profile = CandidateProfile.create(UUID.randomUUID(), "Nguyen Van A", null, null,
                ProfileVisibility.PRIVATE);

        assertThat(profile.visibility()).isEqualTo(ProfileVisibility.PRIVATE);
        assertThat(profile.version()).isZero();
    }
}
