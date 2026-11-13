package com.smartrecruitment.core.support;

import com.smartrecruitment.core.recruiter.application.CompanyReviewService;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyReviewRepository;
import org.jooq.DSLContext;

import java.time.Clock;
import java.util.UUID;

public final class TestCompanies {
    private TestCompanies() { }

    public static Company approve(DSLContext dsl, Company company) {
        return new CompanyReviewService(new JooqCompanyReviewRepository(dsl), Clock.systemUTC())
                .approve(TestIds.next(), company.id(), company.version(), "Synthetic test company approved", UUID.randomUUID());
    }
}
