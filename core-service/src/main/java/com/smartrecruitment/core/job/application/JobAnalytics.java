package com.smartrecruitment.core.job.application;

public record JobAnalytics(
        long total,
        long pending,
        long currentSubmitted,
        long currentUnderReview,
        long reachedUnderReview,
        long reachedShortlisted,
        long reachedInterview,
        long reachedOffered,
        long reachedHired,
        long rejected,
        long withdrawn
) {
}
