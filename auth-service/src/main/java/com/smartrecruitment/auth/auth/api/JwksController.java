package com.smartrecruitment.auth.auth.api;

import com.nimbusds.jose.jwk.RSAKey;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class JwksController {
    private final RSAKey signingKey;
    public JwksController(RSAKey signingKey) { this.signingKey = signingKey; }
    @GetMapping("/.well-known/jwks.json")
    public Map<String, Object> keys() {
        return Map.of("keys", java.util.List.of(signingKey.toPublicJWK().toJSONObject()));
    }
}
