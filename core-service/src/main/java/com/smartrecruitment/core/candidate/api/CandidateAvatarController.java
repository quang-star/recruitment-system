package com.smartrecruitment.core.candidate.api;

import com.smartrecruitment.core.candidate.api.dto.CandidateProfileResponse;
import com.smartrecruitment.core.candidate.application.CandidateAvatarService;
import com.smartrecruitment.core.shared.api.SubjectId;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.UUID;

@RestController
@RequestMapping("/api/v2/candidates/me/avatar")
public class CandidateAvatarController {
    private final CandidateAvatarService avatars;
    public CandidateAvatarController(CandidateAvatarService avatars) { this.avatars = avatars; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CandidateProfileResponse upload(@AuthenticationPrincipal Jwt jwt, @RequestParam long version,
                                           @RequestPart("file") MultipartFile file) {
        return CandidateProfileResponse.from(avatars.upload(SubjectId.parse(jwt.getSubject()), version, file));
    }

    @GetMapping(value = "/{id}", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<InputStreamResource> get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new InputStreamResource(avatars.download(SubjectId.parse(jwt.getSubject()), id)));
    }
}
