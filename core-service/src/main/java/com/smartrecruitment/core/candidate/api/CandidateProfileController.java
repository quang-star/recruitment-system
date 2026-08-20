package com.smartrecruitment.core.candidate.api;

import com.smartrecruitment.core.candidate.api.dto.CandidateProfileResponse;
import com.smartrecruitment.core.candidate.api.dto.PutCandidateProfileRequest;
import com.smartrecruitment.core.candidate.application.CandidateProfileService;
import jakarta.validation.Valid;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/candidates/me")
public class CandidateProfileController {
    private final CandidateProfileService profiles;

    public CandidateProfileController(CandidateProfileService profiles) {
        this.profiles = profiles;
    }

    @GetMapping
    public CandidateProfileResponse getMine(@AuthenticationPrincipal Jwt jwt) {
        return CandidateProfileResponse.from(profiles.getMine(UUID.fromString(jwt.getSubject())));
    }

    @PutMapping
    public CandidateProfileResponse putMine(@AuthenticationPrincipal Jwt jwt,
                                            @Valid @RequestBody PutCandidateProfileRequest request) {
        return CandidateProfileResponse.from(profiles.putMine(UUID.fromString(jwt.getSubject()),
                request.displayName(), request.headline(), request.locationText(), request.visibility(),
                request.version()));
    }
}
