package com.smartrecruitment.core.shared.api;

import com.smartrecruitment.core.candidate.application.CandidateProfileConflictException;
import com.smartrecruitment.core.candidate.application.CandidateProfileNotFoundException;
import com.smartrecruitment.core.cv.application.CandidateCvNotFoundException;
import com.smartrecruitment.core.cv.application.CvStorageException;
import com.smartrecruitment.core.cv.application.CvUploadException;
import com.smartrecruitment.core.recruiter.application.CompanyConflictException;
import com.smartrecruitment.core.recruiter.application.CompanyNotFoundException;
import com.smartrecruitment.core.recruiter.application.RecruiterProfileConflictException;
import com.smartrecruitment.core.recruiter.application.RecruiterProfileNotFoundException;
import com.smartrecruitment.core.recruiter.application.CompanyInvitationConflictException;
import com.smartrecruitment.core.recruiter.application.CompanyInvitationNotFoundException;
import com.smartrecruitment.core.recruiter.application.CompanyInvitationDeliveryException;
import com.smartrecruitment.core.recruiter.application.CompanyMemberConflictException;
import com.smartrecruitment.core.recruiter.application.CompanyMemberNotFoundException;
import com.smartrecruitment.core.job.application.JobConflictException;
import com.smartrecruitment.core.job.application.JobNotFoundException;
import com.smartrecruitment.core.job.application.JobStateException;
import com.smartrecruitment.core.application.application.ApplicationConflictException;
import com.smartrecruitment.core.application.application.ApplicationNotFoundException;
import com.smartrecruitment.core.application.application.ApplicationStateException;
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

    @ExceptionHandler(RecruiterProfileNotFoundException.class)
    ResponseEntity<ApiError> handleRecruiterProfileNotFound(RecruiterProfileNotFoundException exception,
                                                            HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "RECRUITER_PROFILE_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CompanyNotFoundException.class)
    ResponseEntity<ApiError> handleCompanyNotFound(CompanyNotFoundException exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "COMPANY_NOT_FOUND", exception.getMessage(), Map.of(), request);
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

    @ExceptionHandler(RecruiterProfileConflictException.class)
    ResponseEntity<ApiError> handleRecruiterProfileConflict(RecruiterProfileConflictException exception,
                                                             HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "OPTIMISTIC_LOCK_CONFLICT", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CompanyConflictException.class)
    ResponseEntity<ApiError> handleCompanyConflict(CompanyConflictException exception, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "COMPANY_CONFLICT", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CompanyInvitationNotFoundException.class)
    ResponseEntity<ApiError> handleInvitationNotFound(CompanyInvitationNotFoundException exception,
                                                       HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "COMPANY_INVITATION_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CompanyMemberNotFoundException.class)
    ResponseEntity<ApiError> handleCompanyMemberNotFound(CompanyMemberNotFoundException exception,
                                                          HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "COMPANY_MEMBER_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CompanyInvitationConflictException.class)
    ResponseEntity<ApiError> handleInvitationConflict(CompanyInvitationConflictException exception,
                                                       HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "COMPANY_INVITATION_CONFLICT", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CompanyMemberConflictException.class)
    ResponseEntity<ApiError> handleCompanyMemberConflict(CompanyMemberConflictException exception,
                                                          HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "COMPANY_MEMBER_CONFLICT", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(CompanyInvitationDeliveryException.class)
    ResponseEntity<ApiError> handleInvitationDelivery(CompanyInvitationDeliveryException exception,
                                                       HttpServletRequest request) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, "COMPANY_INVITATION_DELIVERY_FAILED",
                exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(JobNotFoundException.class)
    ResponseEntity<ApiError> handleJobNotFound(JobNotFoundException exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "JOB_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(JobConflictException.class)
    ResponseEntity<ApiError> handleJobConflict(JobConflictException exception, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "JOB_CONFLICT", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(JobStateException.class)
    ResponseEntity<ApiError> handleJobState(JobStateException exception, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "JOB_INVALID_STATE", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(ApplicationNotFoundException.class)
    ResponseEntity<ApiError> handleApplicationNotFound(ApplicationNotFoundException exception, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "APPLICATION_NOT_FOUND", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(ApplicationConflictException.class)
    ResponseEntity<ApiError> handleApplicationConflict(ApplicationConflictException exception, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "APPLICATION_CONFLICT", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(ApplicationStateException.class)
    ResponseEntity<ApiError> handleApplicationState(ApplicationStateException exception, HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "APPLICATION_INVALID_STATE", exception.getMessage(), Map.of(), request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> handleIllegalArgument(IllegalArgumentException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", exception.getMessage(), Map.of(), request);
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
