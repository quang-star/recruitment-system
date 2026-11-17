package com.smartrecruitment.core.reprocessing.application;


public record ReprocessingEligibilityCheck(Operation operation, Long resourceId, Long sourceOwnerId,
                                           String sourceHash, Long cvVersionId, Long jobVersionId) {
    public enum Operation { PARSE_CV, PARSE_JD, MATCH_APPLICATION }

    public ReprocessingEligibilityCheck {
        if (operation == null || resourceId == null) throw new IllegalArgumentException("Operation and resourceId are required");
        if (operation == Operation.MATCH_APPLICATION) {
            if (cvVersionId == null || jobVersionId == null) throw new IllegalArgumentException("Matching requires both snapshot version IDs");
        } else if (sourceOwnerId == null || sourceHash == null || !sourceHash.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Parsing requires the expected source owner and SHA-256 hash");
        }
    }
}
