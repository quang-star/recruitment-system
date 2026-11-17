package com.smartrecruitment.core.candidate.domain;

import org.junit.jupiter.api.Test;


import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CandidateProfileTests {
    @Test
    void normalizesProfileText() {
        CandidateProfile profile = CandidateProfile.create(com.smartrecruitment.core.support.TestIds.next(), "  Nguyen Van A  ", " Backend ", " HCM ",
                ProfileVisibility.APPLICATION_ONLY);
        assertThat(profile.displayName()).isEqualTo("Nguyen Van A");
        assertThat(profile.headline()).isEqualTo("Backend");
        assertThat(profile.locationText()).isEqualTo("HCM");
        assertThat(profile.phoneNumber()).isNull();
        assertThat(profile.contactEmail()).isNull();
    }

    @Test
    void normalizesContactAndSocialLinks() {
        CandidateProfile profile = CandidateProfile.create(
                com.smartrecruitment.core.support.TestIds.next(), "Nguyen Van A", "Backend Dev", "Hanoi",
                ProfileVisibility.APPLICATION_ONLY,
                "  0912345678  ", "  contact@example.com  ",
                "  https://linkedin.com/in/nguyenvana  ", "  https://github.com/nguyenvana  ",
                "  https://myportfolio.dev  ", "  https://cdn.example.com/avatar.jpg  ",
                "  Experienced backend engineer specializing in distributed systems.  "
        );

        assertThat(profile.phoneNumber()).isEqualTo("0912345678");
        assertThat(profile.contactEmail()).isEqualTo("contact@example.com");
        assertThat(profile.linkedinUrl()).isEqualTo("https://linkedin.com/in/nguyenvana");
        assertThat(profile.githubUrl()).isEqualTo("https://github.com/nguyenvana");
        assertThat(profile.portfolioUrl()).isEqualTo("https://myportfolio.dev");
        assertThat(profile.avatarUrl()).isEqualTo("https://cdn.example.com/avatar.jpg");
        assertThat(profile.bio()).isEqualTo("Experienced backend engineer specializing in distributed systems.");
    }

    @Test
    void rejectsBlankDisplayName() {
        assertThatThrownBy(() -> CandidateProfile.create(com.smartrecruitment.core.support.TestIds.next(), " ", null, null,
                ProfileVisibility.APPLICATION_ONLY))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void preservesRequestedVisibilityWhenCreated() {
        CandidateProfile profile = CandidateProfile.create(com.smartrecruitment.core.support.TestIds.next(), "Nguyen Van A", null, null,
                ProfileVisibility.PRIVATE);

        assertThat(profile.visibility()).isEqualTo(ProfileVisibility.PRIVATE);
        assertThat(profile.version()).isZero();
    }
}
