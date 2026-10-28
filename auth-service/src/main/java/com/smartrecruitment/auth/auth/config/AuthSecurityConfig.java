package com.smartrecruitment.auth.auth.config;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.proc.SecurityContext;
import com.smartrecruitment.auth.user.application.AuthTokenProperties;
import com.smartrecruitment.auth.user.application.port.AccessTokenIssuer;
import com.smartrecruitment.auth.user.domain.AuthUser;
import com.smartrecruitment.auth.shared.api.SubjectId;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableConfigurationProperties({AuthTokenProperties.class, JwtSigningKeyProperties.class})
public class AuthSecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    @ConditionalOnMissingBean(RSAKey.class)
    RSAKey jwtSigningKey(JwtSigningKeyProperties properties) {
        return PemRsaKeyLoader.load(properties);
    }

    @Bean
    JwtEncoder jwtEncoder(RSAKey signingKey) {
        var source = (com.nimbusds.jose.jwk.source.JWKSource<SecurityContext>)
                (selector, context) -> selector.select(new JWKSet(signingKey));
        return new NimbusJwtEncoder(source);
    }

    @Bean
    JwtDecoder jwtDecoder(RSAKey signingKey, AuthTokenProperties properties) throws Exception {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(signingKey.toRSAPublicKey()).build();
        OAuth2TokenValidator<Jwt> audienceValidator = jwt -> jwt.getAudience().contains(properties.jwt().audience())
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(
                        new OAuth2Error("invalid_token", "JWT audience is not accepted", null));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.jwt().issuer()), audienceValidator,
                jwt -> {
                    try {
                        SubjectId.parse(jwt.getSubject());
                        return OAuth2TokenValidatorResult.success();
                    } catch (org.springframework.security.oauth2.server.resource.InvalidBearerTokenException exception) {
                        return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", exception.getMessage(), null));
                    }
                }));
        return decoder;
    }

    @Bean
    AccessTokenIssuer accessTokenIssuer(JwtEncoder encoder, RSAKey signingKey, AuthTokenProperties properties) {
        return (AuthUser user, List<String> roles, Instant issuedAt) -> {
            Instant expiresAt = issuedAt.plus(properties.jwt().accessTokenTtl());
            JwtClaimsSet claims = JwtClaimsSet.builder().issuer(properties.jwt().issuer())
                    .audience(List.of(properties.jwt().audience()))
                    .subject(user.id().toString()).claim("email", user.email()).claim("roles", roles)
                    .issuedAt(issuedAt).expiresAt(expiresAt).id(UUID.randomUUID().toString()).build();
            String value = encoder.encode(JwtEncoderParameters.from(
                    JwsHeader.with(SignatureAlgorithm.RS256).keyId(signingKey.getKeyID()).build(), claims)).getTokenValue();
            return new AccessTokenIssuer.IssuedAccessToken(value, expiresAt);
        };
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.ignoringRequestMatchers("/api/v2/auth/**"))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.POST,
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
                        .requestMatchers(HttpMethod.GET, "/.well-known/jwks.json", "/actuator/health",
                                "/api/v2/auth/google/config").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt ->
                        jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
        return http.build();
    }
}
