package com.smartrecruitment.auth.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "auth.jwt.signing-key")
public record JwtSigningKeyProperties(String privateKeyPath, String publicKeyPath) {
}
