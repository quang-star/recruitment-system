package com.smartrecruitment.core.reprocessing.application;

import com.smartrecruitment.core.reprocessing.application.port.ReprocessingEligibilityRepository;
import com.smartrecruitment.core.reprocessing.application.port.ReprocessingEligibilityRepository.Reason;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReprocessingEligibilityService {
    private final ReprocessingEligibilityRepository repository;

    public ReprocessingEligibilityService(ReprocessingEligibilityRepository repository) { this.repository = repository; }

    @Transactional(readOnly = true)
    public Eligibility check(ReprocessingEligibilityCheck check) {
        Reason reason = repository.check(check);
        return new Eligibility(reason == Reason.LIVE, reason);
    }

    public record Eligibility(boolean eligible, Reason reasonCode) { }
}
