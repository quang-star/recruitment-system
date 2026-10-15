package com.smartrecruitment.core.job.domain;

import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import java.util.Objects;
import java.util.UUID;

/** Labels/domain belong to this JD version, independently of subsequent catalog decisions. */
public record JobCategorySnapshot(UUID industryId, String industryName, UUID specializationId,
                                  String specializationName, UUID positionId, String positionName,
                                  MatchingDomain matchingDomain) {
    public enum MatchingDomain { IT, OUTSIDE_IT }
    public JobCategorySnapshot {
        Objects.requireNonNull(matchingDomain, "matchingDomain");
        if (industryName == null || industryName.isBlank() || industryName.length() > 160
                || positionName == null || positionName.isBlank() || positionName.length() > 240
                || (specializationName != null && specializationName.length() > 160)) {
            throw new IllegalArgumentException("Job category snapshot is invalid");
        }
        if (matchingDomain == MatchingDomain.IT && !CategoryEntry.IT_INDUSTRY_ID.equals(industryId)) {
            throw new IllegalArgumentException("IT matching requires the approved IT industry identity");
        }
    }
    public boolean supportsMatching() { return matchingDomain == MatchingDomain.IT; }
    public static JobCategorySnapshot legacyIt(String title) {
        return new JobCategorySnapshot(CategoryEntry.IT_INDUSTRY_ID, "Công nghệ thông tin", null, null, null, title, MatchingDomain.IT);
    }
}
