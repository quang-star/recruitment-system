package com.smartrecruitment.auth.user.infrastructure.security;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.smartrecruitment.auth.user.application.GoogleSignInException;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import java.time.Clock;
import java.time.Instant;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoogleIdTokenVerifierTests {
    private static final String CLIENT_ID = "test.apps.googleusercontent.com";
    private static final String NONCE = "random-login-challenge";
    private final RSAKey key = new RSAKeyGenerator(2048).generate();
    private final GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier(CLIENT_ID,
            NimbusJwtDecoder.withPublicKey(key.toRSAPublicKey()).build());

    GoogleIdTokenVerifierTests() throws Exception {}

    @Test
    void acceptsValidSignedGoogleIdentityAndBothDocumentedIssuers() throws Exception {
        var identity = verifier.verify(sign(claims()), NONCE);
        assertThat(identity.subject()).isEqualTo("google-subject");
        assertThat(identity.email()).isEqualTo("candidate@example.com");
        assertThat(verifier.verify(sign(claims().issuer("accounts.google.com")), NONCE)).isEqualTo(identity);
    }

    @Test
    void rejectsWrongSignatureMalformedTokensAndExpiredTokens() throws Exception {
        RSAKey otherKey = new RSAKeyGenerator(2048).generate();
        SignedJWT forged = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims().build());
        forged.sign(new RSASSASigner(otherKey));
        reject(forged.serialize(), NONCE);
        reject("not-a-jwt", NONCE);
        reject(sign(claims().expirationTime(Date.from(Instant.now().minusSeconds(300)))), NONCE);
    }

    @Test
    void rejectsWrongAudienceIssuerAndAuthorizedParty() throws Exception {
        reject(sign(claims().audience("another-client")), NONCE);
        reject(sign(claims().issuer("https://attacker.example.com")), NONCE);
        reject(sign(claims().issuer(null)), NONCE);
        reject(sign(claims().claim("azp", "another-client")), NONCE);
    }

    @Test
    void requiresVerifiedEmailSubjectExpiryAndMatchingNonce() throws Exception {
        reject(sign(claims().claim("email_verified", false)), NONCE);
        reject(sign(claims().claim("email_verified", "true")), NONCE);
        reject(sign(claims().subject("")), NONCE);
        reject(sign(claims().claim("email", "invalid")), NONCE);
        reject(sign(claims().expirationTime(null)), NONCE);
        reject(sign(claims()), "another-nonce");
        reject(sign(claims().claim("nonce", null)), NONCE);
    }

    @Test
    void disabledProviderDoesNotDecodeToken() {
        GoogleIdTokenVerifier disabled = new GoogleIdTokenVerifier("", Clock.systemUTC());
        assertThatThrownBy(() -> disabled.verify("token", NONCE)).isInstanceOf(GoogleSignInException.class)
                .hasMessageContaining("chưa được cấu hình");
    }

    private JWTClaimsSet.Builder claims() {
        return new JWTClaimsSet.Builder().issuer("https://accounts.google.com").audience(CLIENT_ID)
                .subject("google-subject").issueTime(Date.from(Instant.now().minusSeconds(5)))
                .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                .claim("email", "candidate@example.com").claim("email_verified", true).claim("nonce", NONCE);
    }

    private String sign(JWTClaimsSet.Builder claims) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).type(JOSEObjectType.JWT).build(), claims.build());
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    private void reject(String token, String nonce) {
        assertThatThrownBy(() -> verifier.verify(token, nonce)).isInstanceOf(GoogleSignInException.class)
                .hasMessageNotContaining(token);
    }
}
