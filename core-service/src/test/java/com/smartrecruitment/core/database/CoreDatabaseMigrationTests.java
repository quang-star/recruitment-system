package com.smartrecruitment.core.database;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Arrays;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyInvitationRepository;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyRepository;
import com.smartrecruitment.core.notification.infrastructure.persistence.JooqNotificationRepository;
import org.jooq.impl.DSL;
import org.jooq.SQLDialect;
import org.postgresql.ds.PGSimpleDataSource;

import static org.assertj.core.api.Assertions.assertThat;

class CoreDatabaseMigrationTests {

    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgres:17.10-alpine"))
            .withDatabaseName("core_db")
            .withUsername("core_test")
            .withPassword("core_test");

    @BeforeAll
    static void startPostgresAndMigrate() {
        POSTGRES.start();
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    @AfterAll
    static void stopPostgres() {
        POSTGRES.stop();
    }

    @Test
    void appliesEveryCoreMigrationToPostgres() {
        MigrationInfo[] applied = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .info()
                .applied();

        assertThat(Arrays.stream(applied).map(info -> info.getVersion().getVersion()))
                .containsExactly(
                        "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14");
    }

    @Test
    void enforcesPostgresHashFormatForIdempotentApplicationSubmission() throws Exception {
        String definition;
        try (Connection connection = POSTGRES.createConnection("");
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("""
                     SELECT pg_get_constraintdef(oid)
                     FROM pg_constraint
                     WHERE conname = 'ck_applications_submission_hashes'
                     """)) {
            assertThat(result.next()).isTrue();
            definition = result.getString(1);
        }

        assertThat(definition)
                .contains("submission_idempotency_key_hash")
                .contains("submission_request_hash")
                .contains("~");
    }

    @Test
    void invitationAcceptanceCreatesMembershipAndConsumesTokenOnPostgres() {
        var dataSource = new PGSimpleDataSource();
        dataSource.setURL(POSTGRES.getJdbcUrl());
        dataSource.setUser(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        var dsl = DSL.using(dataSource, SQLDialect.POSTGRES);
        var companies = new JooqCompanyRepository(dsl);
        var invitations = new JooqCompanyInvitationRepository(dsl);
        UUID owner = UUID.randomUUID();
        Company company = companies.insertWithOwner(Company.create(owner, "Invitation Test Legal",
                "Invitation Test", "invitation-migration-test", null, null, "VN", null, null), owner);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        CompanyInvitation invitation = invitations.insert(CompanyInvitation.create(company.publicId(),
                "member@example.com", "member@example.com", "RECRUITER", "a".repeat(64), owner,
                now, now.plusDays(7)));
        UUID invitedUser = UUID.randomUUID();

        var member = invitations.accept(invitation, invitedUser, now.plusSeconds(1));

        assertThat(member).isPresent();
        assertThat(member.orElseThrow().role()).isEqualTo("RECRUITER");
        assertThat(companies.findMember(company.publicId(), invitedUser)).isPresent();
        assertThat(invitations.findActiveByTokenHash("a".repeat(64), now.plusSeconds(2))).isEmpty();
        assertThat(invitations.accept(invitation, UUID.randomUUID(), now.plusSeconds(2))).isEmpty();
    }

    @Test
    void notificationsAreDeduplicatedOwnedAndVersionedOnPostgres() {
        var dataSource = new PGSimpleDataSource();
        dataSource.setURL(POSTGRES.getJdbcUrl());
        dataSource.setUser(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        var notifications = new JooqNotificationRepository(DSL.using(dataSource, SQLDialect.POSTGRES));
        UUID owner = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        notifications.insert(owner, "TEST", "Test notification", "Notification body", "/",
                "notification-test", now);
        notifications.insert(owner, "TEST", "Test notification", "Notification body", "/",
                "notification-test", now);

        var feed = notifications.findAll(owner, 50);
        assertThat(feed).hasSize(1);
        assertThat(notifications.countUnread(owner)).isOne();
        assertThat(notifications.markRead(other, feed.getFirst().publicId(), 0, now.plusSeconds(1))).isFalse();
        assertThat(notifications.markRead(owner, feed.getFirst().publicId(), 0, now.plusSeconds(1))).isTrue();
        assertThat(notifications.countUnread(owner)).isZero();
        assertThat(notifications.markRead(owner, feed.getFirst().publicId(), 0, now.plusSeconds(2))).isFalse();
    }
}
