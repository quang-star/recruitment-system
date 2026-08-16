package com.smartrecruitment.auth.user.application;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
public record AuthenticationResult(UUID userId, String accessToken, String refreshToken,
                                   Instant accessTokenExpiresAt, Instant refreshTokenExpiresAt,
                                   List<String> roles) {}
