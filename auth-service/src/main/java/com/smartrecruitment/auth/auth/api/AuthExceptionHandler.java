package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.shared.api.ApiError;
import com.smartrecruitment.auth.shared.api.CorrelationIdFilter;
import com.smartrecruitment.auth.user.application.EmailAlreadyRegisteredException;
import com.smartrecruitment.auth.user.application.InvalidCredentialsException;
import com.smartrecruitment.auth.user.application.InvalidEmailVerificationTokenException;
import com.smartrecruitment.auth.user.application.InvalidRefreshTokenException;
import com.smartrecruitment.auth.user.application.CurrentUserUnavailableException;
import com.smartrecruitment.auth.user.application.VerificationEmailDeliveryException;
import com.smartrecruitment.auth.user.application.InvalidPasswordResetTokenException;
import com.smartrecruitment.auth.user.application.PasswordPolicyException;
import com.smartrecruitment.auth.user.application.SessionNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class AuthExceptionHandler {
    @ExceptionHandler(EmailAlreadyRegisteredException.class)
    ResponseEntity<ApiError> handleDuplicateEmail(EmailAlreadyRegisteredException exception,
                                                  HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "EMAIL_ALREADY_REGISTERED", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(InvalidEmailVerificationTokenException.class)
    ResponseEntity<ApiError> handleInvalidToken(InvalidEmailVerificationTokenException exception,
                                                HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_EMAIL_VERIFICATION_TOKEN",
                exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(InvalidPasswordResetTokenException.class)
    ResponseEntity<ApiError> handleInvalidPasswordResetToken(InvalidPasswordResetTokenException exception,
                                                             HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD_RESET_TOKEN",
                exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(PasswordPolicyException.class)
    ResponseEntity<ApiError> handlePasswordPolicy(PasswordPolicyException exception,
                                                   HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "PASSWORD_POLICY_VIOLATION",
                exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(SessionNotFoundException.class)
    ResponseEntity<ApiError> handleSessionNotFound(SessionNotFoundException exception,
                                                   HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler({InvalidCredentialsException.class, InvalidRefreshTokenException.class})
    ResponseEntity<ApiError> handleAuthenticationFailure(RuntimeException exception, HttpServletRequest request) {
        String code = exception instanceof InvalidCredentialsException ? "INVALID_CREDENTIALS" : "INVALID_REFRESH_TOKEN";
        return error(HttpStatus.UNAUTHORIZED, code, exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CurrentUserUnavailableException.class)
    ResponseEntity<ApiError> handleCurrentUserUnavailable(CurrentUserUnavailableException exception,
                                                          HttpServletRequest request) {
        return error(HttpStatus.UNAUTHORIZED, "CURRENT_USER_UNAVAILABLE", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(VerificationEmailDeliveryException.class)
    ResponseEntity<ApiError> handleVerificationEmailDelivery(VerificationEmailDeliveryException exception,
                                                             HttpServletRequest request) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, "VERIFICATION_EMAIL_UNAVAILABLE",
                exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        Map<String, Object> fields = exception.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(field -> field.getField(), field -> String.valueOf(field.getDefaultMessage()),
                        (first, ignored) -> first));
        return error(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request contains invalid fields",
                Map.of("fields", fields), request);
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String code, String message,
                                           Map<String, Object> details, HttpServletRequest request) {
        return ResponseEntity.status(status)
                .body(ApiError.of(code, message, details, CorrelationIdFilter.current(request)));
    }
}
