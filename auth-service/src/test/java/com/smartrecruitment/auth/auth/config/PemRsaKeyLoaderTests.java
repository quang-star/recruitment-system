package com.smartrecruitment.auth.auth.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PemRsaKeyLoaderTests {
    @TempDir
    Path directory;

    @Test
    void loadsMatchingKeyPairWithStableKeyId() throws Exception {
        KeyPair pair = keyPair();
        Path privateKey = writePem("private.pem", "PRIVATE KEY", pair.getPrivate().getEncoded());
        Path publicKey = writePem("public.pem", "PUBLIC KEY", pair.getPublic().getEncoded());
        JwtSigningKeyProperties properties = new JwtSigningKeyProperties(
                privateKey.toString(), publicKey.toString());

        var first = PemRsaKeyLoader.load(properties);
        var second = PemRsaKeyLoader.load(properties);

        assertThat(first.getKeyID()).isNotBlank().isEqualTo(second.getKeyID());
        assertThat(first.toRSAPublicKey().getModulus()).isEqualTo(second.toRSAPublicKey().getModulus());
    }

    @Test
    void rejectsMismatchedKeyPair() throws Exception {
        KeyPair privatePair = keyPair();
        KeyPair publicPair = keyPair();
        Path privateKey = writePem("private.pem", "PRIVATE KEY", privatePair.getPrivate().getEncoded());
        Path publicKey = writePem("public.pem", "PUBLIC KEY", publicPair.getPublic().getEncoded());

        assertThatThrownBy(() -> PemRsaKeyLoader.load(
                new JwtSigningKeyProperties(privateKey.toString(), publicKey.toString())))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("do not form a pair");
    }

    private KeyPair keyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private Path writePem(String fileName, String label, byte[] encoded) throws Exception {
        String body = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII))
                .encodeToString(encoded);
        Path path = directory.resolve(fileName);
        Files.writeString(path, "-----BEGIN " + label + "-----\n" + body
                + "\n-----END " + label + "-----\n", StandardCharsets.US_ASCII);
        return path;
    }
}
