package com.smartrecruitment.auth.auth.config;

import com.nimbusds.jose.jwk.RSAKey;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

final class PemRsaKeyLoader {
    private static final int MINIMUM_RSA_BITS = 2048;

    private PemRsaKeyLoader() {
    }

    static RSAKey load(JwtSigningKeyProperties properties) {
        Path privateKeyPath = requiredPath(properties.privateKeyPath(), "AUTH_JWT_PRIVATE_KEY_PATH");
        Path publicKeyPath = requiredPath(properties.publicKeyPath(), "AUTH_JWT_PUBLIC_KEY_PATH");

        try {
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            RSAPrivateKey privateKey = (RSAPrivateKey) keyFactory.generatePrivate(
                    new PKCS8EncodedKeySpec(readPem(privateKeyPath, "PRIVATE KEY")));
            RSAPublicKey publicKey = (RSAPublicKey) keyFactory.generatePublic(
                    new X509EncodedKeySpec(readPem(publicKeyPath, "PUBLIC KEY")));

            validateKeyPair(privateKey, publicKey);
            return new RSAKey.Builder(publicKey)
                    .privateKey(privateKey)
                    .keyID(stableKeyId(publicKey))
                    .build();
        } catch (IOException | NoSuchAlgorithmException | InvalidKeySpecException exception) {
            throw new IllegalStateException("JWT signing key files are unreadable or invalid", exception);
        }
    }

    private static Path requiredPath(String value, String environmentName) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(environmentName + " must point to a PEM key file");
        }
        return Path.of(value).toAbsolutePath().normalize();
    }

    private static byte[] readPem(Path path, String label) throws IOException {
        String pem = Files.readString(path, StandardCharsets.US_ASCII)
                .replace("-----BEGIN " + label + "-----", "")
                .replace("-----END " + label + "-----", "")
                .replaceAll("\\s", "");
        if (pem.isBlank()) {
            throw new IllegalStateException("JWT " + label.toLowerCase() + " PEM is empty");
        }
        try {
            return Base64.getDecoder().decode(pem);
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("JWT " + label.toLowerCase() + " PEM is malformed", exception);
        }
    }

    private static void validateKeyPair(RSAPrivateKey privateKey, RSAPublicKey publicKey) {
        if (publicKey.getModulus().bitLength() < MINIMUM_RSA_BITS) {
            throw new IllegalStateException("JWT RSA key must be at least " + MINIMUM_RSA_BITS + " bits");
        }
        if (!(privateKey instanceof RSAPrivateCrtKey crtKey)
                || !crtKey.getModulus().equals(publicKey.getModulus())) {
            throw new IllegalStateException("JWT private and public keys do not form a pair");
        }
    }

    private static String stableKeyId(RSAPublicKey publicKey) throws NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(publicKey.getEncoded());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }
}
