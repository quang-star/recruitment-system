package com.smartrecruitment.auth.user.application.port;

public interface GoogleIdentityVerifier {
    String clientId();
    VerifiedIdentity verify(String credential, String nonce);

    record VerifiedIdentity(String subject, String email, String name, String pictureUrl,
                            boolean authoritativeEmail) {
        public VerifiedIdentity(String subject, String email, String name, String pictureUrl) {
            this(subject, email, name, pictureUrl, false);
        }

        public VerifiedIdentity(String subject, String email) {
            this(subject, email, null, null);
        }
    }
}
