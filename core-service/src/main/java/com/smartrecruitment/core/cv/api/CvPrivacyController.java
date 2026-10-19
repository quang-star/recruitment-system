package com.smartrecruitment.core.cv.api;

import com.smartrecruitment.core.cv.application.CvPrivacyService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;

@RestController
public class CvPrivacyController {
    private final CvPrivacyService privacy;
    public CvPrivacyController(CvPrivacyService privacy) { this.privacy = privacy; }

    @DeleteMapping("/api/v1/cvs/{cvId}")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cvId, @RequestParam long version) {
        privacy.delete(UUID.fromString(jwt.getSubject()), cvId, version);
        return Map.of("status", "ERASURE_REQUESTED");
    }
}
