package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.user.application.AuthAuthenticationService;
import com.smartrecruitment.auth.user.application.AuthCurrentUserService;
import com.smartrecruitment.auth.user.application.AuthRegistrationService;
import com.smartrecruitment.auth.user.application.AuthAccountRecoveryService;
import com.smartrecruitment.auth.user.application.AuthSessionManagementService;
import com.smartrecruitment.auth.user.application.AuthenticationResult;
import com.smartrecruitment.auth.user.application.CurrentUserResult;
import com.smartrecruitment.auth.user.application.EmailVerificationResult;
import com.smartrecruitment.auth.user.application.RegistrationResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthRegistrationService registrationService;
    private final AuthAuthenticationService authenticationService;
    private final AuthCurrentUserService currentUserService;
    private final AuthAccountRecoveryService accountRecoveryService;
    private final AuthSessionManagementService sessionManagementService;
    public AuthController(AuthRegistrationService registrationService, AuthAuthenticationService authenticationService,
                          AuthCurrentUserService currentUserService, AuthAccountRecoveryService accountRecoveryService,
                          AuthSessionManagementService sessionManagementService) {
        this.registrationService = registrationService;
        this.authenticationService = authenticationService;
        this.currentUserService = currentUserService;
        this.accountRecoveryService = accountRecoveryService;
        this.sessionManagementService = sessionManagementService;
    }
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public RegistrationResponse register(@Valid @RequestBody RegisterRequest request) {
        return RegistrationResponse.from(registrationService.register(request.email(), request.password(),
                request.accountType()));
    }
    @PostMapping("/verify-email")
    public EmailVerificationResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        return EmailVerificationResponse.from(registrationService.verifyEmail(request.token()));
    }
    @PostMapping("/resend-verification")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public GenericAcceptedResponse resendVerification(@Valid @RequestBody EmailRequest request) {
        accountRecoveryService.resendVerification(request.email());
        return GenericAcceptedResponse.emailAction();
    }
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public GenericAcceptedResponse forgotPassword(@Valid @RequestBody EmailRequest request) {
        accountRecoveryService.forgotPassword(request.email());
        return GenericAcceptedResponse.emailAction();
    }
    @PostMapping("/reset-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        accountRecoveryService.resetPassword(request.token(), request.newPassword());
    }
    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal Jwt jwt,
                               @Valid @RequestBody ChangePasswordRequest request) {
        accountRecoveryService.changePassword(java.util.UUID.fromString(jwt.getSubject()),
                request.currentPassword(), request.newPassword());
    }
    @GetMapping("/sessions")
    public java.util.List<AuthSessionManagementService.SessionResult> sessions(@AuthenticationPrincipal Jwt jwt) {
        return sessionManagementService.list(java.util.UUID.fromString(jwt.getSubject()));
    }
    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeSession(@AuthenticationPrincipal Jwt jwt, @PathVariable java.util.UUID sessionId) {
        sessionManagementService.revoke(java.util.UUID.fromString(jwt.getSubject()), sessionId);
    }
    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        return TokenResponse.from(authenticationService.login(request.email(), request.password(), request.clientType(),
                request.deviceName(), httpRequest.getHeader("User-Agent"), httpRequest.getRemoteAddr()));
    }
    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request, HttpServletRequest httpRequest) {
        return TokenResponse.from(authenticationService.refresh(request.refreshToken(), httpRequest.getRemoteAddr()));
    }
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshRequest request) {
        authenticationService.logout(request.refreshToken());
    }
    @GetMapping("/me")
    public CurrentUserResponse getCurrentUser(@AuthenticationPrincipal Jwt jwt) {
        return CurrentUserResponse.from(currentUserService.get(java.util.UUID.fromString(jwt.getSubject())));
    }
    public record RegisterRequest(@NotBlank @Email @Size(max = 320) String email,
                                  @NotBlank @Size(min = 8, max = 128) String password,
                                  @jakarta.validation.constraints.Pattern(regexp = "CANDIDATE|RECRUITER")
                                  String accountType) {}
    public record LoginRequest(@NotBlank @Email @Size(max = 320) String email,
                               @NotBlank @Size(min = 8, max = 128) String password,
                               @Size(max = 30)
                               @jakarta.validation.constraints.Pattern(regexp = "WEB|MOBILE|SERVICE") String clientType,
                               @Size(max = 120) String deviceName) {}
    public record RefreshRequest(@NotBlank @Size(min = 64, max = 128) String refreshToken) {}
    public record VerifyEmailRequest(@NotBlank @Size(min = 64, max = 128) String token) {}
    public record EmailRequest(@NotBlank @Email @Size(max = 320) String email) {}
    public record ResetPasswordRequest(@NotBlank @Size(min = 64, max = 128) String token,
                                       @NotBlank @Size(min = 12, max = 128) String newPassword) {}
    public record ChangePasswordRequest(@NotBlank @Size(min = 8, max = 128) String currentPassword,
                                        @NotBlank @Size(min = 12, max = 128) String newPassword) {}
    public record GenericAcceptedResponse(String message) {
        static GenericAcceptedResponse emailAction() {
            return new GenericAcceptedResponse(
                    "If the account is eligible, an email will be sent with the next steps");
        }
    }
    public record TokenResponse(java.util.UUID userId, String accessToken, String refreshToken,
                                java.time.Instant accessTokenExpiresAt, java.time.Instant refreshTokenExpiresAt,
                                java.util.List<String> roles) {
        static TokenResponse from(AuthenticationResult result) {
            return new TokenResponse(result.userId(), result.accessToken(), result.refreshToken(),
                    result.accessTokenExpiresAt(), result.refreshTokenExpiresAt(), result.roles());
        }
    }
    public record RegistrationResponse(java.util.UUID userId, String email, String status, boolean verificationRequired) {
        static RegistrationResponse from(RegistrationResult result) {
            return new RegistrationResponse(result.userId(), result.email(), result.status(), result.verificationRequired());
        }
    }
    public record EmailVerificationResponse(java.util.UUID userId, String email, String status) {
        static EmailVerificationResponse from(EmailVerificationResult result) {
            return new EmailVerificationResponse(result.userId(), result.email(), result.status());
        }
    }
    public record CurrentUserResponse(java.util.UUID userId, String email, String status,
                                      boolean emailVerified, java.util.List<String> roles) {
        static CurrentUserResponse from(CurrentUserResult result) {
            return new CurrentUserResponse(result.userId(), result.email(), result.status(),
                    result.emailVerified(), result.roles());
        }
    }
}
