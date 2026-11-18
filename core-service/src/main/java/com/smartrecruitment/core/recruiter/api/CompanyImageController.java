package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.api.dto.CompanyResponse;
import com.smartrecruitment.core.recruiter.application.CompanyImageService;
import com.smartrecruitment.core.shared.api.SubjectId;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
public class CompanyImageController {
    private final CompanyImageService images;

    public CompanyImageController(CompanyImageService images) { this.images = images; }

    @PostMapping(value = "/api/v2/companies/{companyId}/images/{kind}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CompanyResponse upload(@AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId,
                                  @PathVariable String kind, @RequestParam long version,
                                  @RequestPart("file") MultipartFile file) {
        return CompanyResponse.from(images.upload(SubjectId.parse(jwt.getSubject()), companyId, kind, version, file));
    }

    @GetMapping(value = "/api/v2/public/companies/{companyId}/images/{kind}/{id}", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<InputStreamResource> download(@PathVariable Long companyId, @PathVariable String kind,
                                                         @PathVariable UUID id) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new InputStreamResource(images.download(companyId, kind, id)));
    }
}
