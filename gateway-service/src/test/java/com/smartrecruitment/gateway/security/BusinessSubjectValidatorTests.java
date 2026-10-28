package com.smartrecruitment.gateway.security;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessSubjectValidatorTests {
    @Test
    void acceptsOnlyCanonicalPositiveBigintSubjects() {
        var validator = GatewaySecurityConfig.subjectValidator();
        for (String subject : List.of("1", "9007199254740993", "9223372036854775807")) {
            assertThat(validator.validate(token(subject)).hasErrors()).isFalse();
        }
        for (String subject : List.of("0", "-1", "+1", "01", " 1", "9223372036854775808", "779494ac-c858-4570-a884-6e88423b8e2b")) {
            assertThat(validator.validate(token(subject)).hasErrors()).isTrue();
        }
    }

    private Jwt token(String subject) {
        return Jwt.withTokenValue("synthetic").header("alg", "RS256").subject(subject)
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
    }
}
