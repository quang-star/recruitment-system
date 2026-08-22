package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.api.dto.PutRecruiterProfileRequest;
import com.smartrecruitment.core.recruiter.api.dto.RecruiterProfileResponse;
import com.smartrecruitment.core.recruiter.application.RecruiterProfileService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/recruiter/profile")
public class RecruiterProfileController {
    private final RecruiterProfileService profiles;

    public RecruiterProfileController(RecruiterProfileService profiles) {
        this.profiles = profiles;
    }

    @GetMapping
    public RecruiterProfileResponse getMine(@AuthenticationPrincipal Jwt jwt) {
        return RecruiterProfileResponse.from(profiles.getMine(userId(jwt)));
    }

    @PutMapping
    public RecruiterProfileResponse putMine(@AuthenticationPrincipal Jwt jwt,
                                            @Valid @RequestBody PutRecruiterProfileRequest request) {
        return RecruiterProfileResponse.from(profiles.putMine(userId(jwt), request.displayName(),
                request.businessTitle(), request.businessPhone(), request.version()));
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
