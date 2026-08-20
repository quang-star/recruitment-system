package com.smartrecruitment.core.candidate.application;

import com.smartrecruitment.core.candidate.application.port.CandidateProfileRepository;
import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class CandidateProfileService {
    private final CandidateProfileRepository profiles;

    public CandidateProfileService(CandidateProfileRepository profiles) {
        this.profiles = profiles;
    }

    @Transactional(readOnly = true)
    public CandidateProfile getMine(UUID userId) {
        return profiles.findByUserId(userId).orElseThrow(CandidateProfileNotFoundException::new);
    }

    @Transactional
    public CandidateProfile putMine(UUID userId, String displayName, String headline, String locationText,
                                    ProfileVisibility visibility, Long expectedVersion) {
        return profiles.findByUserId(userId)
                .map(existing -> update(existing, displayName, headline, locationText, visibility, expectedVersion))
                .orElseGet(() -> {
                    if (expectedVersion != null) throw new CandidateProfileConflictException();
                    return profiles.insert(CandidateProfile.create(userId, displayName, headline, locationText, visibility));
                });
    }

    private CandidateProfile update(CandidateProfile existing, String displayName, String headline,
                                    String locationText, ProfileVisibility visibility, Long expectedVersion) {
        if (expectedVersion == null || expectedVersion != existing.version()) {
            throw new CandidateProfileConflictException();
        }
        CandidateProfile updated = existing.update(displayName, headline, locationText, visibility);
        return profiles.update(updated, expectedVersion).orElseThrow(CandidateProfileConflictException::new);
    }
}
