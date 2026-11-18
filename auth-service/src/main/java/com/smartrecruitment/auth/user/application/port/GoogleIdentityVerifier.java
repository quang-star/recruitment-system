package com.smartrecruitment.auth.user.application.port;

public interface GoogleIdentityVerifier {
    String clientId();
    VerifiedIdentity verify(String credential, String nonce);

    record VerifiedIdentity(String subject, String email, String name, String pictureUrl) {
        public VerifiedIdentity(String subject, String email) {
            this(subject, email, null, null);
        }
    }
}
