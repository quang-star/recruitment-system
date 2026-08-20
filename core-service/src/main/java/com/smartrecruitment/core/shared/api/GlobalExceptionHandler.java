package com.smartrecruitment.core.shared.api;

import com.smartrecruitment.core.candidate.application.CandidateProfileConflictException;
import com.smartrecruitment.core.candidate.application.CandidateProfileNotFoundException;
import com.smartrecruitment.core.cv.application.CandidateCvNotFoundException;
import com.smartrecruitment.core.cv.application.CvStorageException;
import com.smartrecruitment.core.cv.application.CvUploadException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(CandidateProfileNotFoundException.class)
    ResponseEntity<ApiError> handleNotFound(CandidateProfileNotFoundException exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "CANDIDATE_PROFILE_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CandidateCvNotFoundException.class)
    ResponseEntity<ApiError> handleCvNotFound(CandidateCvNotFoundException exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "CV_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CvUploadException.class)
    ResponseEntity<ApiError> handleCvUpload(CvUploadException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "CV_UPLOAD_INVALID", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CvStorageException.class)
    ResponseEntity<ApiError> handleCvStorage(CvStorageException exception, HttpServletRequest request) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, "CV_STORAGE_UNAVAILABLE", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiError> handleMaxUpload(MaxUploadSizeExceededException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "CV_UPLOAD_TOO_LARGE", "CV file must not exceed 10 MiB", Map.of(), request);
    }

    @ExceptionHandler(CandidateProfileConflictException.class)
    ResponseEntity<ApiError> handleConflict(CandidateProfileConflictException exception, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "OPTIMISTIC_LOCK_CONFLICT", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        Map<String, Object> fields = exception.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(error -> error.getField(), error -> String.valueOf(error.getDefaultMessage()),
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
