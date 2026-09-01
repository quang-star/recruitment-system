package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.api.dto.ApplicationResponse;
import com.smartrecruitment.core.application.api.dto.UpdateApplicationStatusRequest;
import com.smartrecruitment.core.application.application.ApplicationService;
import com.smartrecruitment.core.application.application.ApplicationCvAccessService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import jakarta.validation.Valid;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/recruiter/applications")
public class RecruiterApplicationController {
    private final ApplicationService applications;
    private final ApplicationCvAccessService cvAccess;

    public RecruiterApplicationController(ApplicationService applications, ApplicationCvAccessService cvAccess) {
        this.applications = applications;
        this.cvAccess = cvAccess;
    }

    @GetMapping
    public List<ApplicationResponse> list(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID jobId) {
        return applications.findForRecruiter(userId(jwt), jobId).stream().map(ApplicationResponse::from).toList();
    }

    @GetMapping("/{applicationId}")
    public ApplicationResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId) {
        return ApplicationResponse.from(applications.getForRecruiter(userId(jwt), applicationId));
    }

    @GetMapping(value = "/{applicationId}/cv", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<StreamingResponseBody> cv(@AuthenticationPrincipal Jwt jwt,
                                                    @PathVariable UUID applicationId) {
        var download = cvAccess.download(userId(jwt), applicationId);
        StreamingResponseBody body = output -> {
            try (var input = download.content()) {
                input.transferTo(output);
            }
        };
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(download.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(download.originalFilename(), java.nio.charset.StandardCharsets.UTF_8)
                        .build().toString())
                .body(body);
    }

    @PatchMapping("/{applicationId}/status")
    public ApplicationResponse updateStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applicationId,
                                            @Valid @RequestBody UpdateApplicationStatusRequest request) {
        return ApplicationResponse.from(applications.updateStatus(userId(jwt), applicationId, request.status(),
                request.reason(), request.version()));
    }

    private UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
