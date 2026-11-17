package com.smartrecruitment.core.candidate.application;

import com.smartrecruitment.core.candidate.application.port.CandidateProfileRepository;
import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CandidateProfileServiceTests {
    @Test
    void createsProfileWithRequestedVisibility() {
        InMemoryProfiles repository = new InMemoryProfiles();
        CandidateProfileService service = new CandidateProfileService(repository);
        Long userId = com.smartrecruitment.core.support.TestIds.next();

        CandidateProfile created = service.putMine(userId, "Nguyen Van A", "Backend engineer", "HCM",
                ProfileVisibility.PRIVATE, null);

        assertThat(created.userId()).isEqualTo(userId);
        assertThat(created.visibility()).isEqualTo(ProfileVisibility.PRIVATE);
        assertThat(created.version()).isZero();
    }

    @Test
    void createsAndUpdatesProfileWithContactAndSocialLinks() {
        InMemoryProfiles repository = new InMemoryProfiles();
        CandidateProfileService service = new CandidateProfileService(repository);
        Long userId = com.smartrecruitment.core.support.TestIds.next();

        CandidateProfile created = service.putMine(userId, "Nguyen Van A", "Backend engineer", "HCM",
                ProfileVisibility.APPLICATION_ONLY, null, "0901234567", "a@example.com",
                "https://linkedin.com/in/a", "https://github.com/a", "https://a.dev",
                "https://cdn.example.com/a.jpg", "Dev bio");

        assertThat(created.phoneNumber()).isEqualTo("0901234567");
        assertThat(created.contactEmail()).isEqualTo("a@example.com");
        assertThat(created.linkedinUrl()).isEqualTo("https://linkedin.com/in/a");
        assertThat(created.githubUrl()).isEqualTo("https://github.com/a");
        assertThat(created.portfolioUrl()).isEqualTo("https://a.dev");
        assertThat(created.avatarUrl()).isEqualTo("https://cdn.example.com/a.jpg");
        assertThat(created.bio()).isEqualTo("Dev bio");

        CandidateProfile updated = service.putMine(userId, "Nguyen Van A Updated", "Lead engineer", "Da Nang",
                ProfileVisibility.APPLICATION_ONLY, created.version(), "0988888888", "updated@example.com",
                "https://linkedin.com/in/updated", "https://github.com/updated", "https://updated.dev",
                "https://cdn.example.com/updated.jpg", "Updated bio");

        assertThat(updated.displayName()).isEqualTo("Nguyen Van A Updated");
        assertThat(updated.phoneNumber()).isEqualTo("0988888888");
        assertThat(updated.contactEmail()).isEqualTo("updated@example.com");
        assertThat(updated.version()).isEqualTo(1L);
    }

    @Test
    void rejectsStaleVersion() {
        InMemoryProfiles repository = new InMemoryProfiles();
        CandidateProfileService service = new CandidateProfileService(repository);
        Long userId = com.smartrecruitment.core.support.TestIds.next();
        CandidateProfile created = service.putMine(userId, "Nguyen Van A", null, null,
                ProfileVisibility.APPLICATION_ONLY, null);

        assertThatThrownBy(() -> service.putMine(userId, "Changed", null, null,
                ProfileVisibility.APPLICATION_ONLY, created.version() + 1))
                .isInstanceOf(CandidateProfileConflictException.class);
    }

    private static final class InMemoryProfiles implements CandidateProfileRepository {
        private CandidateProfile profile;

        @Override
        public Optional<CandidateProfile> findByUserId(Long userId) {
            return Optional.ofNullable(profile).filter(candidate -> candidate.userId().equals(userId));
        }

        @Override
        public CandidateProfile insert(CandidateProfile profile) {
            this.profile = profile;
            return profile;
        }

        @Override
        public Optional<CandidateProfile> update(CandidateProfile profile, long expectedVersion) {
            if (this.profile == null || this.profile.version() != expectedVersion) return Optional.empty();
            this.profile = new CandidateProfile(profile.id(), profile.userId(), profile.displayName(),
                    profile.headline(), profile.locationText(), profile.visibility(), expectedVersion + 1,
                    profile.phoneNumber(), profile.contactEmail(), profile.linkedinUrl(), profile.githubUrl(),
                    profile.portfolioUrl(), profile.avatarUrl(), profile.bio());
            return Optional.of(this.profile);
        }
    }
}
