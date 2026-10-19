package com.smartrecruitment.core.cv.api;

import com.smartrecruitment.core.shared.domain.ExternalAiConsent;

import com.smartrecruitment.core.cv.api.dto.CandidateCvResponse;
import com.smartrecruitment.core.cv.application.CvService;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.InputStreamResource;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cvs")
public class CandidateCvController {
    private final CvService cvs;

    public CandidateCvController(CvService cvs) {
        this.cvs = cvs;
    }

    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public CandidateCvResponse upload(@AuthenticationPrincipal Jwt jwt,
                                      HttpServletRequest request,
                                      @RequestPart("file") MultipartFile file,
                                      @RequestParam(required = false) @Size(max = 160) String title,
                                      @RequestParam(defaultValue = "false") boolean externalAiConsent,
                                      @RequestParam(required = false) String externalAiPolicyVersion) {
        return CandidateCvResponse.from(cvs.upload(userId(jwt), title, file,
                UUID.fromString(CorrelationIdFilter.current(request)),
                ExternalAiConsent.fromChoice(externalAiConsent, externalAiPolicyVersion)));
    }

    @GetMapping
    public List<CandidateCvResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return cvs.listMine(userId(jwt)).stream().map(CandidateCvResponse::from).toList();
    }

    public record RetryCvRequest(@NotNull UUID cvVersionId, @NotNull @Min(0) Long expectedVersion) { }

    @PostMapping("/{cvId}/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CandidateCvResponse retry(@AuthenticationPrincipal Jwt jwt, HttpServletRequest request,
                                      @PathVariable UUID cvId, @Valid @RequestBody RetryCvRequest body) {
        return CandidateCvResponse.from(cvs.retry(userId(jwt), cvId, body.cvVersionId(), body.expectedVersion(),
                UUID.fromString(CorrelationIdFilter.current(request))));
    }

    @GetMapping("/{cvId}")
    public CandidateCvResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cvId) {
        return CandidateCvResponse.from(cvs.getMine(userId(jwt), cvId));
    }

    @GetMapping(value = "/{cvId}/file", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<InputStreamResource> file(@AuthenticationPrincipal Jwt jwt,
                                                      @PathVariable UUID cvId,
                                                      @RequestParam UUID cvVersionId) {
        var download = cvs.downloadMine(userId(jwt), cvId, cvVersionId);
        // Avoid asynchronous header/commit races while retaining bounded-memory streaming.
        var body = new InputStreamResource(download.content());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).contentLength(download.sizeBytes())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(download.originalFilename(), java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .body(body);
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
