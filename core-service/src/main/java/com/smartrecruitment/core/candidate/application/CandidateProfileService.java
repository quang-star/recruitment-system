package com.smartrecruitment.core.candidate.application;

import com.smartrecruitment.core.candidate.application.port.CandidateProfileRepository;
import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


@Service
public class CandidateProfileService {
    private final CandidateProfileRepository profiles;

    public CandidateProfileService(CandidateProfileRepository profiles) {
        this.profiles = profiles;
    }

    @Transactional(readOnly = true)
    public CandidateProfile getMine(Long userId) {
        return profiles.findByUserId(userId).orElseThrow(CandidateProfileNotFoundException::new);
    }

    @Transactional
    public CandidateProfile putMine(Long userId, String displayName, String headline, String locationText,
                                    ProfileVisibility visibility, Long expectedVersion) {
        return putMine(userId, displayName, headline, locationText, visibility, expectedVersion,
                null, null, null, null, null, null, null);
    }

    @Transactional
    public CandidateProfile putMine(Long userId, String displayName, String headline, String locationText,
                                    ProfileVisibility visibility, Long expectedVersion,
                                    String phoneNumber, String contactEmail, String linkedinUrl,
                                    String githubUrl, String portfolioUrl, String avatarUrl, String bio) {
        return profiles.findByUserId(userId)
                .map(existing -> update(existing, displayName, headline, locationText, visibility, expectedVersion,
                        phoneNumber, contactEmail, linkedinUrl, githubUrl, portfolioUrl, avatarUrl, bio))
                .orElseGet(() -> {
                    if (expectedVersion != null) throw new CandidateProfileConflictException();
                    return profiles.insert(CandidateProfile.create(userId, displayName, headline, locationText,
                            visibility, phoneNumber, contactEmail, linkedinUrl, githubUrl, portfolioUrl, avatarUrl, bio));
                });
    }

    private CandidateProfile update(CandidateProfile existing, String displayName, String headline,
                                    String locationText, ProfileVisibility visibility, Long expectedVersion,
                                    String phoneNumber, String contactEmail, String linkedinUrl,
                                    String githubUrl, String portfolioUrl, String avatarUrl, String bio) {
        if (expectedVersion == null || expectedVersion != existing.version()) {
            throw new CandidateProfileConflictException();
        }
        CandidateProfile updated = existing.update(displayName, headline, locationText, visibility,
                phoneNumber, contactEmail, linkedinUrl, githubUrl, portfolioUrl, avatarUrl, bio);
        return profiles.update(updated, expectedVersion).orElseThrow(CandidateProfileConflictException::new);
    }
}
