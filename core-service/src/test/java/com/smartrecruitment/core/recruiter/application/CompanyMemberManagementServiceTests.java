package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyMemberManagementServiceTests {
    @Test
    void ownerCannotBeDemotedOrSuspended() {
        UUID actor = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        CompanyMember owner = member(companyId, actor, "OWNER", "ACTIVE", 0);
        FakeCompanies repository = new FakeCompanies(actor, companyId, owner);

        assertThatThrownBy(() -> new CompanyService(repository).updateMember(actor, companyId,
                owner.publicId(), "VIEWER", "SUSPENDED", 0L))
                .isInstanceOf(CompanyMemberConflictException.class)
                .hasMessageContaining("owner");
        assertThat(repository.updateCalls).isZero();
    }

    @Test
    void managerUpdatesNonOwnerWithOptimisticVersion() {
        UUID actor = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        CompanyMember recruiter = member(companyId, UUID.randomUUID(), "RECRUITER", "ACTIVE", 3);
        FakeCompanies repository = new FakeCompanies(actor, companyId, recruiter);

        CompanyMember updated = new CompanyService(repository).updateMember(actor, companyId,
                recruiter.publicId(), "VIEWER", "SUSPENDED", 3L);

        assertThat(updated.role()).isEqualTo("VIEWER");
        assertThat(updated.status()).isEqualTo("SUSPENDED");
        assertThat(updated.version()).isEqualTo(4);
        assertThat(repository.updateCalls).isOne();
    }

    private static CompanyMember member(UUID companyId, UUID userId, String role, String status, long version) {
        return new CompanyMember(UUID.randomUUID(), companyId, userId, role, status,
                OffsetDateTime.of(2026, 8, 25, 10, 0, 0, 0, ZoneOffset.UTC), version);
    }

    private static final class FakeCompanies implements CompanyRepository {
        private final UUID manager;
        private final UUID companyId;
        private CompanyMember target;
        private int updateCalls;

        private FakeCompanies(UUID manager, UUID companyId, CompanyMember target) {
            this.manager = manager;
            this.companyId = companyId;
            this.target = target;
        }

        @Override public Company insertWithOwner(Company company, UUID owner) { return company; }
        @Override public Optional<Company> findByPublicIdForMember(UUID company, UUID user) { return Optional.empty(); }
        @Override public List<Company> findAllForMember(UUID user) { return List.of(); }
        @Override public boolean isActiveMember(UUID company, UUID user) { return manager.equals(user); }
        @Override public boolean canManage(UUID company, UUID user) {
            return companyId.equals(company) && manager.equals(user);
        }
        @Override public Optional<CompanyMember> findMemberById(UUID company, UUID memberId) {
            return companyId.equals(company) && target.publicId().equals(memberId) ? Optional.of(target) : Optional.empty();
        }
        @Override public Optional<CompanyMember> updateMember(UUID company, UUID memberId, String role,
                                                              String status, long version, OffsetDateTime now) {
            updateCalls++;
            target = new CompanyMember(target.publicId(), target.companyId(), target.userId(), role, status,
                    target.joinedAt(), target.version() + 1);
            return Optional.of(target);
        }
        @Override public Optional<Company> update(Company company, long version) { return Optional.empty(); }
    }
}
