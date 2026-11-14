package com.smartrecruitment.core.cv.api;

import com.smartrecruitment.core.cv.api.dto.CvDraftResponse;
import com.smartrecruitment.core.cv.api.dto.SaveCvDraftRequest;
import com.smartrecruitment.core.cv.application.CvDraftService;
import com.smartrecruitment.core.cv.application.CvDraftValidationException;
import com.smartrecruitment.core.shared.api.SubjectId;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Validated
@RequestMapping("/api/v2/cvs/drafts")
public class CandidateCvDraftController {
    private final CvDraftService drafts;

    public CandidateCvDraftController(CvDraftService drafts) {
        this.drafts = drafts;
    }

    @GetMapping
    public List<CvDraftResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return drafts.listMine(userId(jwt)).stream().map(CvDraftResponse::from).toList();
    }

    @GetMapping("/{draftId}")
    public CvDraftResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long draftId) {
        return CvDraftResponse.from(drafts.getMine(userId(jwt), draftId));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CvDraftResponse create(@AuthenticationPrincipal Jwt jwt,
                                  @Valid @RequestBody SaveCvDraftRequest body) {
        try {
            return CvDraftResponse.from(drafts.create(
                    userId(jwt),
                    body.title(),
                    body.toDomainTemplate(),
                    body.accentColor(),
                    body.toDomainSections(),
                    body.toDomainPayload()
            ));
        } catch (IllegalArgumentException exception) {
            throw new CvDraftValidationException(exception.getMessage());
        }
    }

    @PutMapping("/{draftId}")
    public CvDraftResponse update(@AuthenticationPrincipal Jwt jwt,
                                  @PathVariable Long draftId,
                                  @Valid @RequestBody SaveCvDraftRequest body) {
        if (body.expectedVersion() == null) {
            throw new CvDraftValidationException("expectedVersion is required");
        }
        try {
            return CvDraftResponse.from(drafts.update(
                    userId(jwt),
                    draftId,
                    body.expectedVersion(),
                    body.title(),
                    body.toDomainTemplate(),
                    body.accentColor(),
                    body.toDomainSections(),
                    body.toDomainPayload()
            ));
        } catch (IllegalArgumentException exception) {
            throw new CvDraftValidationException(exception.getMessage());
        }
    }

    @DeleteMapping("/{draftId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt,
                       @PathVariable Long draftId,
                       @RequestParam @NotNull @Min(0) Long version) {
        drafts.delete(userId(jwt), draftId, version);
    }

    private static Long userId(Jwt jwt) {
        return SubjectId.parse(jwt.getSubject());
    }
}
