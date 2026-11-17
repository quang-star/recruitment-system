package com.smartrecruitment.auth.user.application;
import java.time.Instant;
import java.util.List;
public record AuthenticationResult(Long userId, String accessToken, String refreshToken,
                                   Instant accessTokenExpiresAt, Instant refreshTokenExpiresAt,
                                   List<String> roles) {}
