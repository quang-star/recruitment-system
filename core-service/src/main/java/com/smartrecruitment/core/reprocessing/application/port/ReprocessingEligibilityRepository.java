package com.smartrecruitment.core.reprocessing.application.port;

import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck;

public interface ReprocessingEligibilityRepository {
    Reason check(ReprocessingEligibilityCheck check);

    enum Reason { LIVE, SOURCE_NOT_AVAILABLE, SOURCE_CHANGED, ACCESS_REVOKED, OUTSIDE_IT }
}
