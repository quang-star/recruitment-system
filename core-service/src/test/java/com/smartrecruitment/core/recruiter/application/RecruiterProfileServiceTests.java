package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.RecruiterProfileRepository;
import com.smartrecruitment.core.recruiter.domain.RecruiterProfile;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecruiterProfileServiceTests {
    @Test
    void createsAndUpdatesOwnProfileWithOptimisticVersion() {
        InMemoryProfiles repository = new InMemoryProfiles();
        RecruiterProfileService service = new RecruiterProfileService(repository);
        UUID userId = UUID.randomUUID();

        RecruiterProfile created = service.putMine(userId, "Nguyen Recruiter", "Talent Lead", null, null);
        RecruiterProfile updated = service.putMine(userId, "Nguyen A", "Hiring Manager", "+84900000000",
                created.version());

        assertThat(updated.displayName()).isEqualTo("Nguyen A");
        assertThat(updated.businessPhone()).isEqualTo("+84900000000");
        assertThat(updated.version()).isEqualTo(1);
    }

    @Test
    void rejectsStaleVersion() {
        InMemoryProfiles repository = new InMemoryProfiles();
        RecruiterProfileService service = new RecruiterProfileService(repository);
        UUID userId = UUID.randomUUID();
        RecruiterProfile created = service.putMine(userId, "Nguyen Recruiter", null, null, null);

        assertThatThrownBy(() -> service.putMine(userId, "Changed", null, null, created.version() + 1))
                .isInstanceOf(RecruiterProfileConflictException.class);
    }

    private static final class InMemoryProfiles implements RecruiterProfileRepository {
        private RecruiterProfile profile;

        @Override
        public Optional<RecruiterProfile> findByUserId(UUID userId) {
            return Optional.ofNullable(profile).filter(value -> value.userId().equals(userId));
        }

        @Override
        public RecruiterProfile insert(RecruiterProfile value) {
            profile = value;
            return value;
        }

        @Override
        public Optional<RecruiterProfile> update(RecruiterProfile value, long expectedVersion) {
            if (profile == null || profile.version() != expectedVersion) return Optional.empty();
            profile = new RecruiterProfile(value.publicId(), value.userId(), value.displayName(),
                    value.businessTitle(), value.businessPhone(), expectedVersion + 1);
            return Optional.of(profile);
        }
    }
}
