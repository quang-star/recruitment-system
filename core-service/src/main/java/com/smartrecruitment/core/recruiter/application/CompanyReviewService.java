package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyReviewRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyReviewChange;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.shared.application.PageResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class CompanyReviewService {
    private final CompanyReviewRepository companies;
    private final Clock clock;

    public CompanyReviewService(CompanyReviewRepository companies, Clock clock) {
        this.companies = companies;
        this.clock = clock;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResult<Company> search(CompanyReviewSearch search) { return companies.search(search); }

    @Transactional
    public Company approve(Long actorUserId, Long companyId, long expectedVersion, String reason, UUID correlationId) {
        String normalizedReason = validateCommand(actorUserId, expectedVersion, reason, correlationId);
        var company = requireTargetState(companyId, expectedVersion, CompanyStatus.PENDING,
                "Company is no longer pending or has changed; reload before approval");
        return companies.approvePending(company.id(), expectedVersion, actorUserId, normalizedReason, correlationId,
                OffsetDateTime.now(clock)).orElseThrow(CompanyConflictException::new);
    }

    @Transactional
    public Company reject(Long actorUserId, Long companyId, long expectedVersion, String reason, UUID correlationId) {
        return transition(actorUserId, companyId, expectedVersion, reason, correlationId,
                CompanyStatus.PENDING, CompanyStatus.CLOSED, "REJECT",
                "Company is no longer pending or has changed; reload before rejection");
    }

    @Transactional
    public Company suspend(Long actorUserId, Long companyId, long expectedVersion, String reason, UUID correlationId) {
        return transition(actorUserId, companyId, expectedVersion, reason, correlationId,
                CompanyStatus.ACTIVE, CompanyStatus.SUSPENDED, "SUSPEND",
                "Company is no longer active or has changed; reload before suspension");
    }

    @Transactional
    public Company reactivate(Long actorUserId, Long companyId, long expectedVersion, String reason, UUID correlationId) {
        return transition(actorUserId, companyId, expectedVersion, reason, correlationId,
                CompanyStatus.SUSPENDED, CompanyStatus.ACTIVE, "REACTIVATE",
                "Company is no longer suspended or has changed; reload before reactivation");
    }

    private Company transition(Long actorUserId, Long companyId, long expectedVersion, String reason, UUID correlationId,
                               CompanyStatus expectedStatus, CompanyStatus targetStatus, String action,
                               String conflictMessage) {
        String normalizedReason = validateCommand(actorUserId, expectedVersion, reason, correlationId);
        var company = requireTargetState(companyId, expectedVersion, expectedStatus, conflictMessage);
        return companies.transitionStatus(company.id(), expectedStatus, targetStatus, action, expectedVersion,
                actorUserId, normalizedReason, correlationId, OffsetDateTime.now(clock))
                .orElseThrow(CompanyConflictException::new);
    }

    private String validateCommand(Long actorUserId, long expectedVersion, String reason, UUID correlationId) {
        if (actorUserId == null || actorUserId <= 0 || expectedVersion < 0
                || reason == null || reason.isBlank() || reason.strip().length() > 1000 || correlationId == null) {
            throw new IllegalArgumentException("Review action requires an actor, version, reason and correlation ID");
        }
        return reason.strip();
    }

    private Company requireTargetState(Long companyId, long expectedVersion, CompanyStatus expectedStatus, String message) {
        var company = companies.findById(companyId).orElseThrow(CompanyNotFoundException::new);
        if (company.status() != expectedStatus || company.version() != expectedVersion) {
            throw new CompanyConflictException(message);
        }
        return company;
    }

    @Transactional(readOnly = true)
    public List<CompanyReviewChange> history(Long companyId) {
        companies.findById(companyId).orElseThrow(CompanyNotFoundException::new);
        return companies.history(companyId);
    }
}
