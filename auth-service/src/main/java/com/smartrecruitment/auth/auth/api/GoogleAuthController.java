package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.shared.api.ApiError;
import com.smartrecruitment.auth.shared.api.CorrelationIdFilter;
import com.smartrecruitment.auth.user.application.GoogleSignInException;
import com.smartrecruitment.auth.user.application.GoogleSignInService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import com.smartrecruitment.auth.shared.api.SubjectId;

@RestController
@RequestMapping("/api/v2/auth/google")
public class GoogleAuthController {
    private final GoogleSignInService google;

    public GoogleAuthController(GoogleSignInService google) { this.google = google; }

    @GetMapping("/config")
    public ResponseEntity<Config> config() {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(new Config(google.clientId()));
    }

    @PostMapping("/challenge")
    public ResponseEntity<GoogleSignInService.Challenge> challenge() {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(google.challenge());
    }

    @PostMapping("/login")
    public AuthController.TokenResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        return AuthController.TokenResponse.from(google.login(request.credential(), request.nonce(),
                request.accountType(), http.getHeader("User-Agent"), http.getRemoteAddr()));
    }

    @PostMapping("/link")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void link(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LinkRequest request) {
        google.link(SubjectId.parse(jwt.getSubject()), request.credential(), request.nonce());
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<ApiError> concurrentAccountConflict(HttpServletRequest request) {
        GoogleSignInException failure = new GoogleSignInException(GoogleSignInException.Reason.ACCOUNT_CONFLICT);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of("GOOGLE_ACCOUNT_CONFLICT",
                failure.getMessage(), Map.of(), CorrelationIdFilter.current(request)));
    }

    public record Config(String clientId) {}
    public record LoginRequest(@NotBlank @Size(max = 16384) String credential,
                               @NotBlank @Size(min = 64, max = 128) String nonce,
                               @Pattern(regexp = "CANDIDATE|RECRUITER") String accountType) {}
    public record LinkRequest(@NotBlank @Size(max = 16384) String credential,
                              @NotBlank @Size(min = 64, max = 128) String nonce) {}
}
