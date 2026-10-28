package com.smartrecruitment.gateway.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverterAdapter;
import org.springframework.security.web.server.SecurityWebFilterChain;
import reactor.core.publisher.Mono;

@Configuration
public class GatewaySecurityConfig {
    @Bean
    SecurityWebFilterChain securityWebFilterChain(
            ServerHttpSecurity http,
            Converter<Jwt, Mono<AbstractAuthenticationToken>> jwtAuthenticationConverter) {
        return http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .authorizeExchange(authorize -> authorize
                        .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .pathMatchers(HttpMethod.POST,
                                "/api/v2/auth/register",
                                "/api/v2/auth/verify-email",
                                "/api/v2/auth/resend-verification",
                                "/api/v2/auth/forgot-password",
                                "/api/v2/auth/reset-password",
                                "/api/v2/auth/login",
                                "/api/v2/auth/google/login",
                                "/api/v2/auth/google/challenge",
                                "/api/v2/auth/refresh",
                                "/api/v2/auth/logout").permitAll()
                        .pathMatchers(HttpMethod.GET, "/.well-known/jwks.json", "/actuator/health", "/api/v2/public/**",
                                "/api/v2/auth/google/config").permitAll()
                        .pathMatchers("/api/v2/candidates/**", "/api/v2/cvs/**", "/api/v2/candidate/**",
                                "/api/v2/parsed-cvs/**").hasRole("CANDIDATE")
                        .pathMatchers("/api/v2/recruiter/**", "/api/v2/companies/**", "/api/v2/jobs/**",
                                "/api/v2/parsed-jds/**").hasRole("RECRUITER")
                        .pathMatchers("/api/v2/applications/**").hasAnyRole("CANDIDATE", "RECRUITER")
                        .anyExchange().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer.jwt(jwt ->
                        jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)))
                .build();
    }

    @Bean
    Converter<Jwt, Mono<AbstractAuthenticationToken>> jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return new ReactiveJwtAuthenticationConverterAdapter(converter);
    }

    @Bean
    ReactiveJwtDecoder jwtDecoder(@Value("${AUTH_JWKS_URI:http://auth-service:8081/.well-known/jwks.json}") String jwksUri,
                                   @Value("${AUTH_JWT_ISSUER:http://localhost:8080}") String issuer,
                                   @Value("${AUTH_JWT_AUDIENCE:smart-recruitment-api}") String audience) {
        NimbusReactiveJwtDecoder decoder = NimbusReactiveJwtDecoder.withJwkSetUri(jwksUri).build();
        OAuth2TokenValidator<Jwt> audienceValidator = jwt -> jwt.getAudience().contains(audience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(
                        new OAuth2Error("invalid_token", "JWT audience is not accepted", null));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer), audienceValidator, subjectValidator()));
        return decoder;
    }

    static OAuth2TokenValidator<Jwt> subjectValidator() {
        return jwt -> {
            String subject = jwt.getSubject();
            if (subject != null && subject.matches("[1-9][0-9]{0,18}")) {
                try {
                    Long.parseLong(subject);
                    return OAuth2TokenValidatorResult.success();
                } catch (NumberFormatException ignored) {
                    // Signed BIGINT overflow is not a business identity.
                }
            }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid account identity", null));
        };
    }
}
