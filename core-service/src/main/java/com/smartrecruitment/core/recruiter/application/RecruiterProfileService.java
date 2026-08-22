package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.RecruiterProfileRepository;
import com.smartrecruitment.core.recruiter.domain.RecruiterProfile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class RecruiterProfileService {
    private final RecruiterProfileRepository profiles;

    public RecruiterProfileService(RecruiterProfileRepository profiles) {
        this.profiles = profiles;
    }

    @Transactional(readOnly = true)
    public RecruiterProfile getMine(UUID userId) {
        return profiles.findByUserId(userId).orElseThrow(RecruiterProfileNotFoundException::new);
    }

    @Transactional
    public RecruiterProfile putMine(UUID userId, String displayName, String businessTitle,
                                    String businessPhone, Long expectedVersion) {
        return profiles.findByUserId(userId)
                .map(existing -> update(existing, displayName, businessTitle, businessPhone, expectedVersion))
                .orElseGet(() -> {
                    if (expectedVersion != null) throw new RecruiterProfileConflictException();
                    return profiles.insert(RecruiterProfile.create(userId, displayName, businessTitle, businessPhone));
                });
    }

    private RecruiterProfile update(RecruiterProfile existing, String displayName, String businessTitle,
                                    String businessPhone, Long expectedVersion) {
        if (expectedVersion == null || expectedVersion != existing.version()) {
            throw new RecruiterProfileConflictException();
        }
        RecruiterProfile updated = existing.update(displayName, businessTitle, businessPhone);
        return profiles.update(updated, expectedVersion).orElseThrow(RecruiterProfileConflictException::new);
    }
}
