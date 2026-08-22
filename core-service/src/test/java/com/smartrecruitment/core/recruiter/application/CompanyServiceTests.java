package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyServiceTests {
    @Test
    void createMakesActorAnOwnerVisibleInMyCompanies() {
        InMemoryCompanies repository = new InMemoryCompanies();
        CompanyService service = new CompanyService(repository);
        UUID owner = UUID.randomUUID();

        Company company = service.create(owner, "Acme Legal", "Acme", "acme", null, null,
                "VN", null, null);

        assertThat(repository.ownerIds).containsExactly(owner);
        assertThat(service.findMine(owner)).containsExactly(company);
    }

    @Test
    void nonMemberCannotReadCompany() {
        InMemoryCompanies repository = new InMemoryCompanies();
        CompanyService service = new CompanyService(repository);
        UUID owner = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        Company company = service.create(owner, "Acme Legal", "Acme", "acme", null, null,
                "VN", null, null);

        assertThatThrownBy(() -> service.getMine(other, company.publicId()))
                .isInstanceOf(CompanyNotFoundException.class);
    }

    private static final class InMemoryCompanies implements CompanyRepository {
        private final List<Company> companies = new ArrayList<>();
        private final List<UUID> ownerIds = new ArrayList<>();

        @Override
        public Company insertWithOwner(Company company, UUID ownerUserId) {
            companies.add(company);
            ownerIds.add(ownerUserId);
            return company;
        }

        @Override
        public Optional<Company> findByPublicIdForMember(UUID companyId, UUID userId) {
            return companies.stream().filter(value -> value.publicId().equals(companyId))
                    .filter(value -> ownerIds.contains(userId)).findFirst();
        }

        @Override
        public List<Company> findAllForMember(UUID userId) {
            return ownerIds.contains(userId) ? List.copyOf(companies) : List.of();
        }

        @Override
        public boolean isActiveMember(UUID companyId, UUID userId) {
            return findByPublicIdForMember(companyId, userId).isPresent();
        }

        @Override
        public boolean canManage(UUID companyId, UUID userId) {
            return isActiveMember(companyId, userId);
        }

        @Override
        public Optional<Company> update(Company company, long expectedVersion) {
            return companies.stream().filter(value -> value.publicId().equals(company.publicId()))
                    .filter(value -> value.version() == expectedVersion).findFirst();
        }
    }
}
