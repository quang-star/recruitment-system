package com.smartrecruitment.core.cv.api;

import com.smartrecruitment.core.cv.application.CvPrivacyService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class CvPrivacyController {
    private final CvPrivacyService privacy;
    public CvPrivacyController(CvPrivacyService privacy) { this.privacy = privacy; }

    @DeleteMapping("/api/v2/cvs/{cvId}")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long cvId, @RequestParam long version) {
        privacy.delete(com.smartrecruitment.core.shared.api.SubjectId.parse(jwt.getSubject()), cvId, version);
        return Map.of("status", "ERASURE_REQUESTED");
    }
}
