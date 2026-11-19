package com.smartrecruitment.auth.user.infrastructure.security;

import com.smartrecruitment.auth.user.application.GoogleSignInException;
import com.smartrecruitment.auth.user.application.port.GoogleIdentityVerifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.smartrecruitment.auth.user.application.GoogleSignInException.Reason.*;

@Component
public class GoogleIdTokenVerifier implements GoogleIdentityVerifier {
    private static final Set<String> ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");
    private final String clientId;
    private final JwtDecoder decoder;

    @Autowired
    public GoogleIdTokenVerifier(@Value("${auth.google.client-id:}") String clientId, Clock clock) {
        this.clientId = clientId.trim();
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(Duration.ofSeconds(3));
        requests.setReadTimeout(Duration.ofSeconds(5));
        NimbusJwtDecoder googleDecoder = NimbusJwtDecoder
                .withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .restOperations(new RestTemplate(requests)).build();
        JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ofSeconds(30));
        timestamps.setClock(clock);
        googleDecoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestamps, jwt ->
                validClaims(jwt, this.clientId) ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"))));
        this.decoder = googleDecoder;
    }

    // Test seam: use locally signed JWTs without contacting Google.
    GoogleIdTokenVerifier(String clientId, JwtDecoder decoder) {
        this.clientId = clientId;
        this.decoder = decoder;
    }

    @Override
    public String clientId() { return clientId; }

    @Override
    public VerifiedIdentity verify(String credential, String nonce) {
        if (clientId.isBlank()) throw new GoogleSignInException(NOT_CONFIGURED);
        try {
            Jwt jwt = decoder.decode(credential);
            if (!validClaims(jwt, clientId) || !nonce.equals(jwt.getClaimAsString("nonce"))) {
                throw new GoogleSignInException(INVALID_TOKEN);
            }
            String email = jwt.getClaimAsString("email");
            String hostedDomain = stringClaim(jwt, "hd");
            boolean authoritativeEmail = email.toLowerCase(Locale.ROOT).endsWith("@gmail.com")
                    || (hostedDomain != null && !hostedDomain.isBlank());
            return new VerifiedIdentity(
                    jwt.getSubject(),
                    email,
                    extractName(jwt),
                    extractPictureUrl(jwt),
                    authoritativeEmail);
        } catch (JwtException | IllegalArgumentException exception) {
            // Never include the provider token, claims or decoder exception in responses/logs.
            throw new GoogleSignInException(INVALID_TOKEN);
        }
    }

    private static String extractName(Jwt jwt) {
        String fullName = normalizeText(stringClaim(jwt, "name"));
        if (fullName != null) return fullName;
        String combined = Stream.of(stringClaim(jwt, "given_name"), stringClaim(jwt, "family_name"))
                .map(GoogleIdTokenVerifier::normalizeText)
                .filter(value -> value != null && !value.isEmpty())
                .collect(Collectors.joining(" "));
        return combined.isEmpty() ? null : combined;
    }

    private static String extractPictureUrl(Jwt jwt) {
        String raw = stringClaim(jwt, "picture");
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty() || trimmed.length() > 500) return null;
        try {
            URI uri = URI.create(trimmed);
            if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
            if (uri.getHost() == null || uri.getHost().isBlank() || uri.getUserInfo() != null) return null;
            return trimmed;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static String stringClaim(Jwt jwt, String name) {
        Object value = jwt.getClaims().get(name);
        return value instanceof String text ? text : null;
    }

    private static String normalizeText(String value) {
        if (value == null) return null;
        String collapsed = value.trim().replaceAll("\\s+", " ");
        return collapsed.isEmpty() ? null : collapsed;
    }

    static boolean validClaims(Jwt jwt, String clientId) {
        String email = jwt.getClaimAsString("email");
        String subject = jwt.getSubject();
        String authorizedParty = jwt.getClaimAsString("azp");
        return ISSUERS.contains(String.valueOf(jwt.getClaims().get("iss")))
                && jwt.getAudience() != null && jwt.getAudience().contains(clientId)
                && (authorizedParty == null || authorizedParty.equals(clientId))
                && jwt.getExpiresAt() != null && jwt.getIssuedAt() != null
                && Boolean.TRUE.equals(jwt.getClaims().get("email_verified"))
                && subject != null && !subject.isBlank() && subject.length() <= 255
                && email != null && email.length() <= 320 && email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
    }
}
