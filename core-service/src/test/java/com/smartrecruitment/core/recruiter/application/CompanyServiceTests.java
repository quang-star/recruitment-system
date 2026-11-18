package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyServiceTests {
    @Test
    void createMakesActorAnOwnerVisibleInMyCompanies() {
        InMemoryCompanies repository = new InMemoryCompanies();
        CompanyService service = new CompanyService(repository);
        Long owner = com.smartrecruitment.core.support.TestIds.next();

        Company company = service.create(owner, "Acme Legal", "Acme", "acme", null, null,
                "VN", null, null);

        assertThat(repository.ownerIds).containsExactly(owner);
        assertThat(service.findMine(owner)).containsExactly(company);
    }

    @Test
    void nonMemberCannotReadCompany() {
        InMemoryCompanies repository = new InMemoryCompanies();
        CompanyService service = new CompanyService(repository);
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        Long other = com.smartrecruitment.core.support.TestIds.next();
        Company company = service.create(owner, "Acme Legal", "Acme", "acme", null, null,
                "VN", null, null);

        assertThatThrownBy(() -> service.getMine(other, company.id()))
                .isInstanceOf(CompanyNotFoundException.class);
    }

    @Test
    void activeCompanyCannotChangeLegalIdentityFields() {
        InMemoryCompanies repository = new InMemoryCompanies();
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        Company active = new Company(com.smartrecruitment.core.support.TestIds.next(), "Acme Legal", "Acme", "acme",
                null, null, "VN", "0101234567", null, null, null,
                CompanyStatus.ACTIVE, CompanyVerificationStatus.UNVERIFIED, owner, 0);
        repository.insertWithOwner(active, owner);
        CompanyService service = new CompanyService(repository);

        Company updated = service.updateMine(owner, active.id(), "Acme Legal", "Acme Updated", "acme",
                "New desc", null, "VN", "0101234567", "51-200", "/logos/smartrecruitment.svg", null, 0L);
        assertThat(updated.displayName()).isEqualTo("Acme Updated");

        assertThatThrownBy(() -> service.updateMine(owner, active.id(), "Fake Other Corp", "Acme", "acme",
                null, null, "VN", "0101234567", null, null, null, 0L))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.updateMine(owner, active.id(), "Acme Legal", "Acme", "acme",
                null, null, "VN", "9999999999", null, null, null, 0L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static final class InMemoryCompanies implements CompanyRepository {
        private final List<Company> companies = new ArrayList<>();
        private final List<Long> ownerIds = new ArrayList<>();

        @Override
        public Company insertWithOwner(Company company, Long ownerUserId) {
            companies.add(company);
            ownerIds.add(ownerUserId);
            return company;
        }

        @Override
        public Optional<Company> findByIdForMember(Long companyId, Long userId) {
            return companies.stream().filter(value -> value.id().equals(companyId))
                    .filter(value -> ownerIds.contains(userId)).findFirst();
        }

        @Override
        public List<Company> findAllForMember(Long userId) {
            return ownerIds.contains(userId) ? List.copyOf(companies) : List.of();
        }

        @Override
        public boolean isActiveMember(Long companyId, Long userId) {
            return findByIdForMember(companyId, userId).isPresent();
        }

        @Override
        public boolean canManage(Long companyId, Long userId) {
            return isActiveMember(companyId, userId);
        }

        @Override
        public Optional<Company> update(Company company, long expectedVersion) {
            return companies.stream().filter(value -> value.id().equals(company.id()))
                    .filter(value -> value.version() == expectedVersion)
                    .map(ignored -> company)
                    .findFirst();
        }
    }
}
