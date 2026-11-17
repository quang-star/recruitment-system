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
        if (actorUserId == null || actorUserId <= 0 || expectedVersion < 0
                || reason == null || reason.isBlank() || reason.strip().length() > 1000 || correlationId == null) {
            throw new IllegalArgumentException("Approval requires an actor, version, reason and correlation ID");
        }
        var company = companies.findById(companyId).orElseThrow(CompanyNotFoundException::new);
        if (company.status() != CompanyStatus.PENDING || company.version() != expectedVersion) {
            throw new CompanyConflictException("Company is no longer pending or has changed; reload before approval");
        }
        return companies.approvePending(companyId, expectedVersion, actorUserId, reason.strip(), correlationId,
                OffsetDateTime.now(clock)).orElseThrow(CompanyConflictException::new);
    }

    @Transactional(readOnly = true)
    public List<CompanyReviewChange> history(Long companyId) {
        companies.findById(companyId).orElseThrow(CompanyNotFoundException::new);
        return companies.history(companyId);
    }
}
