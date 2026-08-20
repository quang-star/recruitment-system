package com.smartrecruitment.core.cv.api;

import com.smartrecruitment.core.cv.api.dto.CandidateCvResponse;
import com.smartrecruitment.core.cv.application.CvService;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import jakarta.validation.constraints.Size;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
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
                                      @RequestParam(required = false) @Size(max = 160) String title) {
        return CandidateCvResponse.from(cvs.upload(userId(jwt), title, file,
                UUID.fromString(CorrelationIdFilter.current(request))));
    }

    @GetMapping
    public List<CandidateCvResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return cvs.listMine(userId(jwt)).stream().map(CandidateCvResponse::from).toList();
    }

    @GetMapping("/{cvId}")
    public CandidateCvResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID cvId) {
        return CandidateCvResponse.from(cvs.getMine(userId(jwt), cvId));
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
