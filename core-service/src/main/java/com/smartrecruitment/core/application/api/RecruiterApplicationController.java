package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.api.dto.ApplicationResponse;
import com.smartrecruitment.core.application.api.dto.UpdateApplicationStatusRequest;
import com.smartrecruitment.core.application.application.ApplicationCvAccessService;
import com.smartrecruitment.core.application.application.ApplicationSearch;
import com.smartrecruitment.core.application.application.ApplicationService;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.shared.application.PageResult;

import jakarta.validation.Valid;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.core.io.InputStreamResource;
import org.springframework.beans.factory.annotation.Autowired;
import com.smartrecruitment.core.candidate.application.port.CandidateProfileRepository;

import java.util.List;

@RestController
@RequestMapping("/api/v2/recruiter/applications")
public class RecruiterApplicationController {
    private final ApplicationService applications;
    private final ApplicationCvAccessService cvAccess;
    private final CandidateProfileRepository candidateProfiles;

    public RecruiterApplicationController(ApplicationService applications, ApplicationCvAccessService cvAccess) {
        this(applications, cvAccess, null);
    }

    @Autowired
    public RecruiterApplicationController(ApplicationService applications, ApplicationCvAccessService cvAccess,
                                          @Autowired(required = false) CandidateProfileRepository candidateProfiles) {
        this.applications = applications;
        this.cvAccess = cvAccess;
        this.candidateProfiles = candidateProfiles;
    }

    private ApplicationResponse toResponse(Application application) {
        if (candidateProfiles == null) {
            return ApplicationResponse.from(application);
        }
        var profile = candidateProfiles.findByUserId(application.candidateUserId()).orElse(null);
        return ApplicationResponse.from(application, profile);
    }

    @GetMapping(params = "!page")
    public List<ApplicationResponse> list(@AuthenticationPrincipal Jwt jwt, @RequestParam Long jobId) {
        return applications.findForRecruiter(userId(jwt), jobId).stream().map(this::toResponse).toList();
    }

    @GetMapping(params = "page")
    public PageResult<ApplicationResponse> search(
            @AuthenticationPrincipal Jwt jwt, @RequestParam Long jobId,
            @RequestParam int page, @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(required = false) ApplicationStatus status) {
        var search = new ApplicationSearch(page, size, q, sort, status);
        return applications.searchForRecruiter(userId(jwt), jobId, search).map(this::toResponse);
    }

    @GetMapping("/{applicationId}")
    public ApplicationResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long applicationId) {
        return toResponse(applications.getForRecruiter(userId(jwt), applicationId));
    }

    @GetMapping(value = "/{applicationId}/cv", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<InputStreamResource> cv(@AuthenticationPrincipal Jwt jwt,
                                                    @PathVariable Long applicationId) {
        var download = cvAccess.download(userId(jwt), applicationId);
        // The resource converter streams and closes the source on the request thread.
        var body = new InputStreamResource(download.content());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(download.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(download.originalFilename(), java.nio.charset.StandardCharsets.UTF_8)
                        .build().toString())
                .body(body);
    }

    @PatchMapping("/{applicationId}/status")
    public ApplicationResponse updateStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable Long applicationId,
                                            @Valid @RequestBody UpdateApplicationStatusRequest request) {
        return toResponse(applications.updateStatus(userId(jwt), applicationId, request.status(),
                request.reason(), request.version()));
    }

    private Long userId(Jwt jwt) { return com.smartrecruitment.core.shared.api.SubjectId.parse(jwt.getSubject()); }
}
