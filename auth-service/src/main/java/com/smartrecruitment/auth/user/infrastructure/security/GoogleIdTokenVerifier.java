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

import java.time.Clock;
import java.time.Duration;
import java.util.Set;

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
            return new VerifiedIdentity(jwt.getSubject(), jwt.getClaimAsString("email"));
        } catch (JwtException | IllegalArgumentException exception) {
            // Never include the provider token, claims or decoder exception in responses/logs.
            throw new GoogleSignInException(INVALID_TOKEN);
        }
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
