package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyMemberManagementServiceTests {
    @Test
    void ownerCannotBeDemotedOrSuspended() {
        Long actor = com.smartrecruitment.core.support.TestIds.next();
        Long companyId = com.smartrecruitment.core.support.TestIds.next();
        CompanyMember owner = member(companyId, actor, "OWNER", "ACTIVE", 0);
        FakeCompanies repository = new FakeCompanies(actor, companyId, owner);

        assertThatThrownBy(() -> new CompanyService(repository).updateMember(actor, companyId,
                owner.id(), "VIEWER", "SUSPENDED", 0L))
                .isInstanceOf(CompanyMemberConflictException.class)
                .hasMessageContaining("owner");
        assertThat(repository.updateCalls).isZero();
    }

    @Test
    void managerUpdatesNonOwnerWithOptimisticVersion() {
        Long actor = com.smartrecruitment.core.support.TestIds.next();
        Long companyId = com.smartrecruitment.core.support.TestIds.next();
        CompanyMember recruiter = member(companyId, com.smartrecruitment.core.support.TestIds.next(), "RECRUITER", "ACTIVE", 3);
        FakeCompanies repository = new FakeCompanies(actor, companyId, recruiter);

        CompanyMember updated = new CompanyService(repository).updateMember(actor, companyId,
                recruiter.id(), "VIEWER", "SUSPENDED", 3L);

        assertThat(updated.role()).isEqualTo("VIEWER");
        assertThat(updated.status()).isEqualTo("SUSPENDED");
        assertThat(updated.version()).isEqualTo(4);
        assertThat(repository.updateCalls).isOne();
    }

    private static CompanyMember member(Long companyId, Long userId, String role, String status, long version) {
        return new CompanyMember(com.smartrecruitment.core.support.TestIds.next(), companyId, userId, role, status,
                OffsetDateTime.of(2026, 8, 25, 10, 0, 0, 0, ZoneOffset.UTC), version);
    }

    private static final class FakeCompanies implements CompanyRepository {
        private final Long manager;
        private final Long companyId;
        private CompanyMember target;
        private int updateCalls;

        private FakeCompanies(Long manager, Long companyId, CompanyMember target) {
            this.manager = manager;
            this.companyId = companyId;
            this.target = target;
        }

        @Override public Company insertWithOwner(Company company, Long owner) { return company; }
        @Override public Optional<Company> findByIdForMember(Long company, Long user) { return Optional.empty(); }
        @Override public List<Company> findAllForMember(Long user) { return List.of(); }
        @Override public boolean isActiveMember(Long company, Long user) { return manager.equals(user); }
        @Override public boolean canManage(Long company, Long user) {
            return companyId.equals(company) && manager.equals(user);
        }
        @Override public Optional<CompanyMember> findMemberById(Long company, Long memberId) {
            return companyId.equals(company) && target.id().equals(memberId) ? Optional.of(target) : Optional.empty();
        }
        @Override public Optional<CompanyMember> updateMember(Long company, Long memberId, String role,
                                                              String status, long version, OffsetDateTime now) {
            updateCalls++;
            target = new CompanyMember(target.id(), target.companyId(), target.userId(), role, status,
                    target.joinedAt(), target.version() + 1);
            return Optional.of(target);
        }
        @Override public Optional<Company> update(Company company, long version) { return Optional.empty(); }
    }
}
