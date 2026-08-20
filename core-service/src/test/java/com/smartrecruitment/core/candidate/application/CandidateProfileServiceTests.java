package com.smartrecruitment.core.candidate.application;

import com.smartrecruitment.core.candidate.application.port.CandidateProfileRepository;
import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CandidateProfileServiceTests {
    @Test
    void createsProfileWithRequestedVisibility() {
        InMemoryProfiles repository = new InMemoryProfiles();
        CandidateProfileService service = new CandidateProfileService(repository);
        UUID userId = UUID.randomUUID();

        CandidateProfile created = service.putMine(userId, "Nguyen Van A", "Backend engineer", "HCM",
                ProfileVisibility.PRIVATE, null);

        assertThat(created.userId()).isEqualTo(userId);
        assertThat(created.visibility()).isEqualTo(ProfileVisibility.PRIVATE);
        assertThat(created.version()).isZero();
    }

    @Test
    void rejectsStaleVersion() {
        InMemoryProfiles repository = new InMemoryProfiles();
        CandidateProfileService service = new CandidateProfileService(repository);
        UUID userId = UUID.randomUUID();
        CandidateProfile created = service.putMine(userId, "Nguyen Van A", null, null,
                ProfileVisibility.APPLICATION_ONLY, null);

        assertThatThrownBy(() -> service.putMine(userId, "Changed", null, null,
                ProfileVisibility.APPLICATION_ONLY, created.version() + 1))
                .isInstanceOf(CandidateProfileConflictException.class);
    }

    private static final class InMemoryProfiles implements CandidateProfileRepository {
        private CandidateProfile profile;

        @Override
        public Optional<CandidateProfile> findByUserId(UUID userId) {
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
            this.profile = new CandidateProfile(profile.publicId(), profile.userId(), profile.displayName(),
                    profile.headline(), profile.locationText(), profile.visibility(), expectedVersion + 1);
            return Optional.of(this.profile);
        }
    }
}
