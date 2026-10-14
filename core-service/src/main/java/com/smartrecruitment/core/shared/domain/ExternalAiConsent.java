package com.smartrecruitment.core.shared.domain;

/** Consent belongs to the uploaded/submitted document version, independently of CV sharing. */
public record ExternalAiConsent(boolean granted, String policyVersion) {
    public static final String POLICY_VERSION = "external-ai/1.0";

    public ExternalAiConsent {
        if (granted && (policyVersion == null || policyVersion.isBlank() || policyVersion.length() > 40)) {
            throw new IllegalArgumentException("External AI consent requires a policy version");
        }
        if (!granted && policyVersion != null) {
            throw new IllegalArgumentException("Declined external AI consent must not have a policy version");
        }
    }

    public static ExternalAiConsent declined() { return new ExternalAiConsent(false, null); }

    public static ExternalAiConsent fromChoice(boolean granted, String policyVersion) {
        if (granted && !POLICY_VERSION.equals(policyVersion)) {
            throw new IllegalArgumentException("External AI consent policy is missing or outdated");
        }
        return granted ? new ExternalAiConsent(true, POLICY_VERSION) : declined();
    }
}
