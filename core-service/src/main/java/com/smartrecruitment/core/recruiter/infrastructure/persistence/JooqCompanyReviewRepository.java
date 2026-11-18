package com.smartrecruitment.core.recruiter.infrastructure.persistence;

import com.smartrecruitment.core.recruiter.application.CompanyReviewSearch;
import com.smartrecruitment.core.recruiter.application.port.CompanyReviewRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyReviewChange;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.shared.application.PageResult;
import com.smartrecruitment.core.shared.infrastructure.SearchText;
import com.smartrecruitment.core.shared.infrastructure.persistence.TimestampGuards;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyReviewHistory.COMPANY_REVIEW_HISTORY;

@Repository
public class JooqCompanyReviewRepository implements CompanyReviewRepository {
    private final DSLContext dsl;

    public JooqCompanyReviewRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public PageResult<Company> search(CompanyReviewSearch search) {
        Condition filters = search.status() == null ? DSL.trueCondition() : COMPANIES.STATUS.eq(search.status().name());
        if (!search.q().isEmpty()) filters = filters.and(SearchText.contains(COMPANIES.DISPLAY_NAME, search.q())
                .or(SearchText.contains(COMPANIES.LEGAL_NAME, search.q()))
                .or(SearchText.contains(COMPANIES.SLUG, search.q())));
        var query = dsl.selectFrom(COMPANIES).where(filters);
        long total = dsl.fetchCount(query);
        var items = query.orderBy(COMPANIES.CREATED_AT.asc(), COMPANIES.ID.asc())
                .limit(search.size()).offset(search.offset()).fetch(JooqCompanyRepository::toDomain);
        return new PageResult<>(items, total, search.page(), search.size());
    }

    @Override
    public Optional<Company> findById(Long companyId) {
        return dsl.selectFrom(COMPANIES).where(COMPANIES.ID.eq(companyId)).fetchOptional(JooqCompanyRepository::toDomain);
    }

    @Override
    public Optional<Company> approvePending(Long companyId, long expectedVersion, Long actorUserId,
                                           String reason, UUID correlationId, OffsetDateTime now) {
        return transitionStatus(companyId, CompanyStatus.PENDING, CompanyStatus.ACTIVE, "APPROVE",
                expectedVersion, actorUserId, reason, correlationId, now);
    }

    @Override
    public Optional<Company> transitionStatus(Long companyId, CompanyStatus expectedStatus, CompanyStatus targetStatus,
                                              String action, long expectedVersion, Long actorUserId,
                                              String reason, UUID correlationId, OffsetDateTime now) {
        var updated = dsl.update(COMPANIES).set(COMPANIES.STATUS, targetStatus.name())
                .set(COMPANIES.UPDATED_AT, TimestampGuards.atLeast(COMPANIES.CREATED_AT, COMPANIES.UPDATED_AT, now))
                .set(COMPANIES.VERSION, COMPANIES.VERSION.plus(1L))
                .where(COMPANIES.ID.eq(companyId)).and(COMPANIES.STATUS.eq(expectedStatus.name()))
                .and(COMPANIES.VERSION.eq(expectedVersion)).returning().fetchOptional();
        if (updated.isEmpty()) return Optional.empty();
        var company = updated.get();
        dsl.insertInto(COMPANY_REVIEW_HISTORY)
                .set(COMPANY_REVIEW_HISTORY.COMPANY_ID, companyId)
                .set(COMPANY_REVIEW_HISTORY.ACTOR_USER_ID, actorUserId)
                .set(COMPANY_REVIEW_HISTORY.ACTION, action)
                .set(COMPANY_REVIEW_HISTORY.FROM_STATUS, expectedStatus.name())
                .set(COMPANY_REVIEW_HISTORY.TO_STATUS, targetStatus.name())
                .set(COMPANY_REVIEW_HISTORY.VERSION, company.getVersion())
                .set(COMPANY_REVIEW_HISTORY.REASON, reason)
                .set(COMPANY_REVIEW_HISTORY.CORRELATION_ID, correlationId)
                .set(COMPANY_REVIEW_HISTORY.OCCURRED_AT, now).execute();
        return Optional.of(JooqCompanyRepository.toDomain(company));
    }

    @Override
    public List<CompanyReviewChange> history(Long companyId) {
        return dsl.selectFrom(COMPANY_REVIEW_HISTORY).where(COMPANY_REVIEW_HISTORY.COMPANY_ID.eq(companyId))
                .orderBy(COMPANY_REVIEW_HISTORY.OCCURRED_AT.desc(), COMPANY_REVIEW_HISTORY.ID.desc()).limit(100)
                .fetch(row -> new CompanyReviewChange(row.getId(), row.getCompanyId(), row.getActorUserId(), row.getAction(),
                        CompanyStatus.valueOf(row.getFromStatus()), CompanyStatus.valueOf(row.getToStatus()), row.getVersion(),
                        row.getReason(), row.getCorrelationId(), row.getOccurredAt()));
    }
}
