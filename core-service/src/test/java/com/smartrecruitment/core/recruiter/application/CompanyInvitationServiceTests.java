package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationRepository;
import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationSender;
import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationTokenGenerator;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CompanyInvitationServiceTests {
    private static final Instant NOW = Instant.parse("2026-08-25T10:00:00Z");

    @Test
    void invitationNormalizesEmailStoresOnlyHashAndSendsRawToken() {
        Fixture fixture = new Fixture();

        CompanyInvitation invitation = fixture.service.invite(fixture.owner, fixture.company.publicId(),
                " New.Recruiter@Example.COM ", "RECRUITER");

        assertThat(invitation.normalizedEmail()).isEqualTo("new.recruiter@example.com");
        assertThat(invitation.tokenHash()).isEqualTo("a".repeat(64));
        assertThat(invitation.expiresAt()).isEqualTo(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusDays(7));
        assertThat(fixture.sender.rawToken).isEqualTo("r".repeat(64));
        assertThat(fixture.sender.email).isEqualTo("New.Recruiter@Example.COM");
    }

    @Test
    void duplicateActiveInvitationAndMismatchedJwtEmailAreRejected() {
        Fixture fixture = new Fixture();
        fixture.service.invite(fixture.owner, fixture.company.publicId(), "member@example.com", "VIEWER");

        assertThatThrownBy(() -> fixture.service.invite(fixture.owner, fixture.company.publicId(),
                "MEMBER@example.com", "VIEWER"))
                .isInstanceOf(CompanyInvitationConflictException.class)
                .hasMessageContaining("active invitation");
        assertThatThrownBy(() -> fixture.service.accept(UUID.randomUUID(), "other@example.com", "r".repeat(64)))
                .isInstanceOf(CompanyInvitationConflictException.class)
                .hasMessageContaining("different email");
    }

    @Test
    void matchingAuthenticatedRecruiterAcceptsInvitationAsAnActiveMember() {
        Fixture fixture = new Fixture();
        fixture.service.invite(fixture.owner, fixture.company.publicId(), "member@example.com", "COMPANY_ADMIN");
        UUID memberUserId = UUID.randomUUID();

        CompanyMember member = fixture.service.accept(memberUserId, "MEMBER@example.com", "r".repeat(64));

        assertThat(member.userId()).isEqualTo(memberUserId);
        assertThat(member.role()).isEqualTo("COMPANY_ADMIN");
        assertThat(member.status()).isEqualTo("ACTIVE");
    }

    private static final class Fixture {
        private final UUID owner = UUID.randomUUID();
        private final Company company = Company.create(owner, "Acme Legal", "Acme", "invitation-test-acme",
                null, null, "VN", null, null);
        private final FakeCompanies companies = new FakeCompanies(company, owner);
        private final FakeInvitations invitations = new FakeInvitations();
        private final CapturingSender sender = new CapturingSender();
        private final CompanyInvitationService service = new CompanyInvitationService(companies, invitations,
                new FixedTokens(), sender, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private record FakeCompanies(Company company, UUID owner) implements CompanyRepository {
        @Override public Company insertWithOwner(Company value, UUID userId) { return value; }
        @Override public Optional<Company> findByPublicIdForMember(UUID companyId, UUID userId) {
            return company.publicId().equals(companyId) && owner.equals(userId) ? Optional.of(company) : Optional.empty();
        }
        @Override public List<Company> findAllForMember(UUID userId) { return List.of(company); }
        @Override public boolean isActiveMember(UUID companyId, UUID userId) { return owner.equals(userId); }
        @Override public boolean canManage(UUID companyId, UUID userId) { return owner.equals(userId); }
        @Override public Optional<Company> update(Company value, long expectedVersion) { return Optional.of(value); }
    }

    private static final class FakeInvitations implements CompanyInvitationRepository {
        private final List<CompanyInvitation> values = new ArrayList<>();
        @Override public CompanyInvitation insert(CompanyInvitation invitation) { values.add(invitation); return invitation; }
        @Override public List<CompanyInvitation> findAll(UUID companyId) { return List.copyOf(values); }
        @Override public Optional<CompanyInvitation> findActive(UUID companyId, String email, OffsetDateTime now) {
            return values.stream().filter(value -> value.companyId().equals(companyId))
                    .filter(value -> value.normalizedEmail().equals(email)).filter(value -> value.activeAt(now)).findFirst();
        }
        @Override public Optional<CompanyInvitation> findActiveByTokenHash(String hash, OffsetDateTime now) {
            return values.stream().filter(value -> value.tokenHash().equals(hash)).filter(value -> value.activeAt(now)).findFirst();
        }
        @Override public int revokeExpired(UUID companyId, String email, OffsetDateTime now) { return 0; }
        @Override public boolean revoke(UUID companyId, UUID id, long version, OffsetDateTime now) { return false; }
        @Override public Optional<CompanyMember> accept(CompanyInvitation invitation, UUID userId, OffsetDateTime now) {
            return Optional.of(new CompanyMember(UUID.randomUUID(), invitation.companyId(), userId,
                    invitation.role(), "ACTIVE", now, 0));
        }
    }

    private static final class FixedTokens implements CompanyInvitationTokenGenerator {
        @Override public String generate() { return "r".repeat(64); }
        @Override public String hash(String rawToken) { return "a".repeat(64); }
    }

    private static final class CapturingSender implements CompanyInvitationSender {
        private String email;
        private String rawToken;
        @Override public void send(String email, String companyName, String role, String rawToken,
                                   OffsetDateTime expiresAt) {
            this.email = email;
            this.rawToken = rawToken;
        }
    }
}

