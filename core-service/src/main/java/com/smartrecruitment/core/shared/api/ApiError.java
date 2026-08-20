package com.smartrecruitment.core.shared.api;

import java.time.Instant;
import java.util.Map;

public record ApiError(String code, String message, Map<String, Object> details,
                       String correlationId, Instant timestamp) {
    public static ApiError of(String code, String message, Map<String, Object> details, String correlationId) {
        return new ApiError(code, message, Map.copyOf(details), correlationId, Instant.now());
    }
}
