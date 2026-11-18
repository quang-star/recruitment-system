package com.smartrecruitment.core.recruiter.application.port;

import com.smartrecruitment.core.recruiter.application.CompanyReviewSearch;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyReviewChange;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.shared.application.PageResult;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CompanyReviewRepository {
    PageResult<Company> search(CompanyReviewSearch search);
    Optional<Company> findById(Long companyId);
    Optional<Company> approvePending(Long companyId, long expectedVersion, Long actorUserId,
                                     String reason, UUID correlationId, OffsetDateTime now);
    Optional<Company> transitionStatus(Long companyId, CompanyStatus expectedStatus, CompanyStatus targetStatus,
                                       String action, long expectedVersion, Long actorUserId,
                                       String reason, UUID correlationId, OffsetDateTime now);
    List<CompanyReviewChange> history(Long companyId);
}
