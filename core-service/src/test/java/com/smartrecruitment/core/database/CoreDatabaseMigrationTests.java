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
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyInvitationRepository;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyRepository;
import com.smartrecruitment.core.notification.infrastructure.persistence.JooqNotificationRepository;
import org.jooq.impl.DSL;
import org.jooq.SQLDialect;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.TransactionAwareDataSourceProxy;
import org.springframework.transaction.support.TransactionTemplate;
import com.smartrecruitment.core.catalog.application.CategoryConflictException;
import com.smartrecruitment.core.catalog.application.CategoryService;
import com.smartrecruitment.core.catalog.application.CategoryAuditSearch;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.catalog.infrastructure.persistence.JooqCategoryRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CoreDatabaseMigrationTests {
    private static final Long LEGACY_NOTIFICATION_OWNER = 90001L;
    private static Long LEGACY_CATEGORY_ID;
    private static final Long LEGACY_CATEGORY_ACTOR = 90002L;
    private static final Long LEGACY_MATCH_APPLICATION = 90003L;
    private static final Long LEGACY_MATCH_RESULT = 90006L;

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
                .target(org.flywaydb.core.api.MigrationVersion.fromVersion("19"))
                .load()
                .migrate();
        var source = new PGSimpleDataSource();
        source.setURL(POSTGRES.getJdbcUrl()); source.setUser(POSTGRES.getUsername()); source.setPassword(POSTGRES.getPassword());
        var dsl = DSL.using(source, SQLDialect.POSTGRES);
        UUID owner = UUID.randomUUID(), category = UUID.randomUUID(), actor = UUID.randomUUID();
        UUID application = UUID.randomUUID(), cvVersion = UUID.randomUUID(), jobVersion = UUID.randomUUID(), result = UUID.randomUUID();
        dsl.execute("INSERT INTO notifications(public_id,user_id,type,title,message,link_url,deduplication_key) "
                + "VALUES (?,?,'MATCHING_COMPLETED','Legacy match','87.4/100','/','synthetic-legacy-match'),"
                + "(?,?,'TEST','Other history','Keep this unrelated message','/','synthetic-other')",
                UUID.randomUUID(), owner, UUID.randomUUID(), owner);
        dsl.execute("INSERT INTO job_category_catalog(id,kind,name,normalized_name,status) VALUES (?, 'INDUSTRY', ?, ?, 'ACTIVE')",
                category, "Synthetic legacy category", "synthetic legacy category");
        dsl.execute("INSERT INTO job_category_history(category_id,actor_user_id,action,after_state) VALUES (?, ?, 'CREATE', '{}'::jsonb)",
                category, actor);
        dsl.execute("INSERT INTO application_matching_projections(application_id,cv_version_id,job_version_id,matching_result_id,status,final_score,version) "
                + "VALUES (?, ?, ?, ?, 'COMPLETED', 82.5, 4)", application, cvVersion, jobVersion, result);
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration").target("25").load().migrate();
        for (Object[] mapping : List.of(new Object[]{"auth", "user", owner, LEGACY_NOTIFICATION_OWNER},
                new Object[]{"auth", "user", actor, LEGACY_CATEGORY_ACTOR},
                new Object[]{"core", "application", application, LEGACY_MATCH_APPLICATION},
                new Object[]{"core", "cv_version", cvVersion, 90004L},
                new Object[]{"core", "job_version", jobVersion, 90005L},
                new Object[]{"ai", "matching_result", result, LEGACY_MATCH_RESULT})) {
            dsl.execute("INSERT INTO legacy_identity_map(service,entity_type,legacy_id,entity_id) VALUES (?,?,?,?)", mapping);
        }
        LEGACY_CATEGORY_ID = dsl.fetchOne("SELECT entity_id FROM legacy_identity_map WHERE service='core' AND entity_type='category' AND legacy_id=?", category)
                .get(0, Long.class);
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration").load().migrate();
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
                        "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29");
    }

    @Test
    void migrationRemovesHistoricalMatchingScoresButKeepsUnrelatedNotificationHistory() {
        var source = new PGSimpleDataSource();
        source.setURL(POSTGRES.getJdbcUrl()); source.setUser(POSTGRES.getUsername()); source.setPassword(POSTGRES.getPassword());
        var feed = new JooqNotificationRepository(DSL.using(source, SQLDialect.POSTGRES)).findAll(LEGACY_NOTIFICATION_OWNER, 10);
        assertThat(feed).hasSize(2);
        assertThat(feed).noneMatch(item -> item.message().contains("87.4"));
        assertThat(feed).anyMatch(item -> item.message().equals("Keep this unrelated message"));
    }

    @Test
    void offlineCodegenColumnsMatchTheMigratedPostgresSchema() {
        var dsl = DSL.using(dataSource(), SQLDialect.POSTGRES);
        for (var table : com.smartrecruitment.core.infrastructure.jooq.generated.Public.PUBLIC.getTables()) {
            var actual = dsl.fetch("SELECT column_name,udt_name FROM information_schema.columns "
                    + "WHERE table_schema='public' AND table_name=? ORDER BY ordinal_position", table.getName());
            assertThat(Arrays.stream(table.fields()).map(org.jooq.Field::getName).toList())
                    .as("Generated columns for %s", table.getName())
                    .containsExactlyInAnyOrderElementsOf(actual.getValues(0, String.class));
            for (var column : actual) {
                if (column.get(1, String.class).equals("int8")) {
                    assertThat(table.field(column.get(0, String.class)).getType()).isEqualTo(Long.class);
                }
            }
        }
    }

    @Test
    void missingOwnerMappingsAbortBeforeChangingLegacyDataAndCanBeSuppliedForRetry() {
        String schema = "identity_missing_" + UUID.randomUUID().toString().replace("-", "");
        Flyway.configure().dataSource(dataSource()).schemas(schema).defaultSchema(schema).target("24").load().migrate();
        var dsl = DSL.using(dataSource(), SQLDialect.POSTGRES);
        UUID legacyProfile = UUID.randomUUID(), legacyOwner = UUID.randomUUID();
        Long existingId = dsl.fetchOne("INSERT INTO " + schema + ".candidate_profiles "
                + "(public_id,user_id,display_name,visibility) VALUES (?,?,'Synthetic owner','APPLICATION_ONLY') RETURNING id",
                legacyProfile, legacyOwner).get(0, Long.class);
        assertThatThrownBy(() -> Flyway.configure().dataSource(dataSource()).schemas(schema).defaultSchema(schema)
                .load().migrate()).isInstanceOf(org.flywaydb.core.api.FlywayException.class)
                .hasStackTraceContaining("requires complete, unambiguous imported auth/user mappings");
        assertThat(dsl.fetchOne("SELECT public_id,user_id FROM " + schema + ".candidate_profiles WHERE id=?", existingId)
                .get(1, UUID.class)).isEqualTo(legacyOwner);
        dsl.execute("INSERT INTO " + schema + ".legacy_identity_map(service,entity_type,legacy_id,entity_id) "
                + "VALUES ('auth','user',?,?)", legacyOwner, 80001L);
        UUID legacyCv = UUID.randomUUID(), legacyVersion = UUID.randomUUID(), messageId = UUID.randomUUID();
        dsl.execute("INSERT INTO " + schema + ".legacy_identity_map VALUES ('core','cv',?,500),('core','cv_version',?,501)", legacyCv, legacyVersion);
        dsl.execute("INSERT INTO " + schema + ".outbox_events(public_id,aggregate_type,aggregate_id,aggregate_version,event_type,schema_version,idempotency_key,correlation_id,payload) "
                + "VALUES (?,'CV',?,1,'cv.uploaded.v1',1,?,?,?::json)", messageId, legacyCv,
                "cv.uploaded.v1:" + legacyVersion, UUID.randomUUID(), "{\"cvVersionId\":\"" + legacyVersion + "\"}");
        Flyway.configure().dataSource(dataSource()).schemas(schema).defaultSchema(schema).load().migrate();
        assertThat(dsl.fetchOne("SELECT id,user_id FROM " + schema + ".candidate_profiles").get(0, Long.class)).isEqualTo(existingId);
        assertThat(dsl.fetchOne("SELECT user_id FROM " + schema + ".candidate_profiles").get(0, Long.class)).isEqualTo(80001L);
        assertThat(dsl.fetchOne("SELECT entity_id FROM " + schema + ".legacy_identity_map "
                + "WHERE service='core' AND entity_type='candidate_profile' AND legacy_id=?", legacyProfile)
                .get(0, Long.class)).isEqualTo(existingId);
        var pending = dsl.fetchOne("SELECT event_id,aggregate_id,event_type,schema_version,idempotency_key,payload FROM " + schema + ".outbox_events");
        assertThat(pending.get(0, UUID.class)).isEqualTo(messageId);
        assertThat(pending.get(1, Long.class)).isEqualTo(500L);
        assertThat(pending.get(2, String.class)).isEqualTo("cv.uploaded.v2");
        assertThat(pending.get(3, Short.class)).isEqualTo((short) 2);
        assertThat(pending.get(4, String.class)).isEqualTo("cv.uploaded.v2:501");
        assertThat(pending.get(5, String.class)).contains("\"501\"");
    }

    @Test
    void matchingGenerationMigrationPreservesLegacyResultWithoutInventingOrder() {
        var dsl = DSL.using(dataSource(), SQLDialect.POSTGRES);
        var row = dsl.selectFrom(com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationMatchingProjections.APPLICATION_MATCHING_PROJECTIONS)
                .where(com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationMatchingProjections.APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(LEGACY_MATCH_APPLICATION)).fetchOne();
        assertThat(row.getMatchingResultId()).isEqualTo(LEGACY_MATCH_RESULT);
        assertThat(row.getResultGeneration()).isNull();
        assertThat(row.getFinalScore().doubleValue()).isEqualTo(82.5);
        assertThat(row.getVersion()).isEqualTo(4L);
        assertThatThrownBy(() -> dsl.execute("UPDATE application_matching_projections SET result_generation=0 WHERE application_id=?", LEGACY_MATCH_APPLICATION))
                .isInstanceOf(org.jooq.exception.DataAccessException.class);
    }

    @Test
    void categoryReviewMigrationPreservesLegacyHistoryWithoutInventingMetadata() {
        var repository = new JooqCategoryRepository(DSL.using(dataSource(), SQLDialect.POSTGRES), new tools.jackson.databind.ObjectMapper());
        var history = repository.history(LEGACY_CATEGORY_ID);
        assertThat(history).hasSize(1);
        var legacy = history.getFirst();
        assertThat(legacy.actorUserId()).isEqualTo(LEGACY_CATEGORY_ACTOR);
        assertThat(legacy.action()).isEqualTo("CREATE");
        assertThat(legacy.afterState()).isEqualTo("{}");
        assertThat(legacy.beforeState()).isNull();
        assertThat(legacy.reason()).isNull();
        assertThat(legacy.correlationId()).isNull();
        assertThat(legacy.version()).isNull();
        assertThat(legacy.occurredAt()).isNotNull();
    }

    @Test
    void auditSearchPreservesLegacyNullMetadataAndReturnsEmptyPagesWithAnAccurateTotal() {
        var repository = new JooqCategoryRepository(DSL.using(dataSource(), SQLDialect.POSTGRES), new tools.jackson.databind.ObjectMapper());
        var legacy = repository.searchHistory(new CategoryAuditSearch(0, 20, LEGACY_CATEGORY_ACTOR, LEGACY_CATEGORY_ID,
                "CREATE", null, null, null));
        assertThat(legacy.total()).isOne();
        assertThat(legacy.items()).hasSize(1);
        assertThat(legacy.items().getFirst().resourceId()).isEqualTo(LEGACY_CATEGORY_ID);
        assertThat(legacy.items().getFirst().reason()).isNull();
        assertThat(legacy.items().getFirst().correlationId()).isNull();
        assertThat(legacy.items().getFirst().version()).isNull();
        var empty = repository.searchHistory(new CategoryAuditSearch(5, 20, null, LEGACY_CATEGORY_ID, null, null, null, null));
        assertThat(empty.total()).isOne();
        assertThat(empty.items()).isEmpty();
        assertThat(repository.searchHistory(new CategoryAuditSearch(0, 20, null, LEGACY_CATEGORY_ID, null, UUID.randomUUID(), null, null)).total()).isZero();
    }

    @Test
    void auditSearchCombinesAllFiltersAndUsesTimeThenIdForStablePagination() {
        var dsl = DSL.using(dataSource(), SQLDialect.POSTGRES);
        var repository = new JooqCategoryRepository(dsl, new tools.jackson.databind.ObjectMapper());
        Long actor = com.smartrecruitment.core.support.TestIds.next(), otherActor = com.smartrecruitment.core.support.TestIds.next(), resource = com.smartrecruitment.core.support.TestIds.next(), otherResource = com.smartrecruitment.core.support.TestIds.next();
        UUID correlation = UUID.randomUUID(), otherCorrelation = UUID.randomUUID();
        for (Long category : List.of(resource, otherResource)) {
            String name = "Synthetic audit category " + category;
            dsl.execute("INSERT INTO job_category_catalog(id,kind,name,normalized_name,status) VALUES (?, 'INDUSTRY', ?, ?, 'ACTIVE')",
                    category, name, name.toLowerCase(java.util.Locale.ROOT));
        }
        var timestamp = OffsetDateTime.parse("2026-01-01T12:00:00Z");
        long edit = auditFixture(dsl, resource, actor, "EDIT", correlation, timestamp);
        long deferred = auditFixture(dsl, resource, actor, "DEFER", correlation, timestamp);
        long other = auditFixture(dsl, otherResource, actor, "EDIT", otherCorrelation, timestamp.minusSeconds(1));
        auditFixture(dsl, resource, otherActor, "EDIT", otherCorrelation, timestamp.plusSeconds(1));
        var exact = repository.searchHistory(new CategoryAuditSearch(0, 20, actor, resource, "EDIT", correlation, timestamp, timestamp));
        assertThat(exact.total()).isOne();
        assertThat(exact.items()).extracting(change -> change.id()).containsExactly(edit);
        var first = repository.searchHistory(new CategoryAuditSearch(0, 1, actor, null, null, null, null, null));
        var second = repository.searchHistory(new CategoryAuditSearch(1, 1, actor, null, null, null, null, null));
        var third = repository.searchHistory(new CategoryAuditSearch(2, 1, actor, null, null, null, null, null));
        assertThat(first.total()).isEqualTo(3);
        assertThat(second.total()).isEqualTo(3);
        assertThat(third.total()).isEqualTo(3);
        assertThat(List.of(first.items().getFirst().id(), second.items().getFirst().id(), third.items().getFirst().id()))
                .containsExactly(deferred, edit, other);
        assertThat(repository.searchHistory(new CategoryAuditSearch(0, 20, actor, null, null, null,
                timestamp.plusSeconds(1), null)).items()).isEmpty();
        assertThat(repository.searchHistory(new CategoryAuditSearch(0, 20, null, resource, null, null,
                null, timestamp.minusSeconds(1))).items()).isEmpty();
    }

    private static long auditFixture(org.jooq.DSLContext dsl, Long resource, Long actor, String action, UUID correlation,
                                     OffsetDateTime timestamp) {
        var id = DSL.field(DSL.name("id"), Long.class);
        return dsl.insertInto(DSL.table(DSL.name("job_category_history")))
                .set(DSL.field(DSL.name("category_id"), Long.class), resource)
                .set(DSL.field(DSL.name("actor_user_id"), Long.class), actor)
                .set(DSL.field(DSL.name("action"), String.class), action)
                .set(DSL.field(DSL.name("correlation_id"), UUID.class), correlation)
                .set(DSL.field(DSL.name("occurred_at"), OffsetDateTime.class), timestamp)
                .set(DSL.field(DSL.name("after_state"), org.jooq.JSONB.class), org.jooq.JSONB.jsonb("{}"))
                .returning(id).fetchOne().get(id);
    }

    @Test
    void deferredProposalRetainsItsNameReservationAndReopenKeepsVersionedAudit() {
        var dsl = DSL.using(dataSource(), SQLDialect.POSTGRES);
        var repository = new JooqCategoryRepository(dsl, new tools.jackson.databind.ObjectMapper());
        var service = new CategoryService(repository);
        Long actor = com.smartrecruitment.core.support.TestIds.next(); UUID correlation = UUID.randomUUID();
        String name = "Synthetic deferred industry " + com.smartrecruitment.core.support.TestIds.next();
        var proposal = service.propose(actor, CategoryKind.INDUSTRY, null, name);
        var deferred = service.act(actor, proposal.id(), 0, "DEFER", null, null, "  Awaiting expert review  ", correlation);
        assertThat(deferred.status()).isEqualTo("DEFERRED");
        assertThat(service.propose(actor, CategoryKind.INDUSTRY, null, "  " + name + "  ").id()).isEqualTo(proposal.id());
        assertThat(service.list(false)).noneMatch(entry -> entry.id().equals(proposal.id()));
        assertThatThrownBy(() -> service.create(actor, CategoryKind.INDUSTRY, null, name, "Duplicate reservation", correlation))
                .isInstanceOf(CategoryConflictException.class);
        assertThatThrownBy(() -> dsl.execute(
                "INSERT INTO job_category_catalog(id,kind,name,normalized_name,status) VALUES (?, 'INDUSTRY', ?, ?, 'PENDING')",
                com.smartrecruitment.core.support.TestIds.next(), name, name.toLowerCase(java.util.Locale.ROOT)))
                .isInstanceOf(org.jooq.exception.DataAccessException.class);
        var child = service.propose(actor, CategoryKind.SPECIALIZATION, deferred.id(), "Synthetic deferred specialization");
        service.act(actor, child.id(), 0, "DEFER", null, null, "Parent review is deferred", correlation);
        assertThat(service.propose(actor, CategoryKind.SPECIALIZATION, deferred.id(), "Synthetic deferred specialization").id()).isEqualTo(child.id());
        assertThatThrownBy(() -> dsl.execute(
                "INSERT INTO job_category_catalog(id,kind,parent_id,name,normalized_name,status) VALUES (?, 'SPECIALIZATION', ?, ?, ?, 'PENDING')",
                com.smartrecruitment.core.support.TestIds.next(), deferred.id(), "Synthetic deferred specialization", "synthetic deferred specialization"))
                .isInstanceOf(org.jooq.exception.DataAccessException.class);
        var reopened = service.act(actor, proposal.id(), 1, "REOPEN", null, null, "Evidence supplied", correlation);
        assertThat(reopened.status()).isEqualTo("PENDING");
        assertThat(reopened.version()).isEqualTo(2);
        var history = repository.history(proposal.id());
        assertThat(history).extracting(change -> change.action()).containsExactly("REOPEN", "DEFER", "PROPOSE");
        assertThat(history).extracting(change -> change.version()).containsExactly(2L, 1L, 0L);
        assertThat(history.get(1).reason()).isEqualTo("Awaiting expert review");
        assertThat(history.get(1).correlationId()).isEqualTo(correlation);
        assertThat(history.get(2).correlationId()).isNull();
        assertThat(history.get(2).reason()).isEqualTo("Đề xuất từ phân loại nghề do recruiter nhập cho Job.");
    }

    @Test
    void approvalRenamesAtomicallyAndNameConflictLeavesProposalAndAuditUnchanged() {
        var source = dataSource();
        var repository = new JooqCategoryRepository(DSL.using(new TransactionAwareDataSourceProxy(source), SQLDialect.POSTGRES),
                new tools.jackson.databind.ObjectMapper());
        var service = new CategoryService(repository);
        var transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
        Long actor = com.smartrecruitment.core.support.TestIds.next(); UUID correlation = UUID.randomUUID();
        var target = service.create(actor, CategoryKind.INDUSTRY, null, "Synthetic existing industry " + com.smartrecruitment.core.support.TestIds.next(), "Known terminology", correlation);
        var proposal = service.propose(actor, CategoryKind.INDUSTRY, null, "Synthetic pending industry " + com.smartrecruitment.core.support.TestIds.next());
        assertThatThrownBy(() -> transactions.execute(status -> service.act(actor, proposal.id(), 0, "APPROVE", target.name(), null,
                "Duplicate reviewed name", correlation))).isInstanceOf(CategoryConflictException.class);
        assertThat(repository.find(proposal.id()).orElseThrow()).isEqualTo(proposal);
        assertThat(repository.history(proposal.id())).hasSize(1);
        String reviewedName = "Synthetic reviewed industry " + com.smartrecruitment.core.support.TestIds.next();
        var approved = transactions.execute(status -> service.act(actor, proposal.id(), 0, "APPROVE", reviewedName, null,
                "Canonical terminology verified", correlation));
        assertThat(approved.name()).isEqualTo(reviewedName);
        assertThat(approved.status()).isEqualTo("ACTIVE");
        var review = repository.history(proposal.id()).getFirst();
        assertThat(review.beforeState()).contains(proposal.name(), "PENDING");
        assertThat(review.afterState()).contains(reviewedName, "ACTIVE");
        assertThat(review.version()).isEqualTo(1);
        assertThat(review.reason()).isEqualTo("Canonical terminology verified");
    }

    @Test
    void concurrentReviewsCommitOneVersionAndOnlyTheWinningAudit() throws Exception {
        var source = dataSource();
        var dsl = DSL.using(new TransactionAwareDataSourceProxy(source), SQLDialect.POSTGRES);
        var mapper = new tools.jackson.databind.ObjectMapper();
        var originalRepository = new JooqCategoryRepository(dsl, mapper);
        var proposal = new CategoryService(originalRepository).propose(com.smartrecruitment.core.support.TestIds.next(), CategoryKind.INDUSTRY, null,
                "Synthetic concurrent industry " + com.smartrecruitment.core.support.TestIds.next());
        var bothRead = new CountDownLatch(2);
        var repository = new JooqCategoryRepository(dsl, mapper) {
            @Override
            public Optional<CategoryEntry> find(Long id) {
                var entry = super.find(id);
                if (proposal.id().equals(id)) {
                    bothRead.countDown();
                    try {
                        if (!bothRead.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent QA review did not reach both reads");
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException(exception);
                    }
                }
                return entry;
            }
        };
        var service = new CategoryService(repository);
        var transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
        Long firstActor = com.smartrecruitment.core.support.TestIds.next(), secondActor = com.smartrecruitment.core.support.TestIds.next();
        UUID firstCorrelation = UUID.randomUUID(), secondCorrelation = UUID.randomUUID();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var approve = executor.submit(() -> reviewResult(transactions, service, firstActor, proposal.id(), "APPROVE", firstCorrelation));
            var reject = executor.submit(() -> reviewResult(transactions, service, secondActor, proposal.id(), "REJECT", secondCorrelation));
            var outcomes = List.of(approve.get(20, TimeUnit.SECONDS), reject.get(20, TimeUnit.SECONDS));
            assertThat(outcomes).containsExactlyInAnyOrder("COMMITTED", "CONFLICT");
        }
        var current = originalRepository.find(proposal.id()).orElseThrow();
        assertThat(current.version()).isOne();
        assertThat(current.status()).isIn("ACTIVE", "REJECTED");
        var history = originalRepository.history(proposal.id());
        assertThat(history).hasSize(2);
        var winner = history.getFirst();
        assertThat(winner.version()).isEqualTo(1);
        assertThat(winner.reason()).isEqualTo("Synthetic " + winner.action() + " review");
        assertThat(winner.actorUserId()).isEqualTo("APPROVE".equals(winner.action()) ? firstActor : secondActor);
        assertThat(winner.correlationId()).isEqualTo("APPROVE".equals(winner.action()) ? firstCorrelation : secondCorrelation);
    }

    private static String reviewResult(TransactionTemplate transactions, CategoryService service, Long actor, Long id,
                                       String action, UUID correlation) {
        try {
            transactions.execute(status -> service.act(actor, id, 0, action, null, null, "Synthetic " + action + " review", correlation));
            return "COMMITTED";
        } catch (CategoryConflictException exception) {
            return "CONFLICT";
        }
    }

    private static PGSimpleDataSource dataSource() {
        var source = new PGSimpleDataSource();
        source.setURL(POSTGRES.getJdbcUrl());
        source.setUser(POSTGRES.getUsername());
        source.setPassword(POSTGRES.getPassword());
        return source;
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
    void categoryProposalMergeKeepsChildrenSelectableAndStoresVersionedAudit() {
        var source = new PGSimpleDataSource();
        source.setURL(POSTGRES.getJdbcUrl()); source.setUser(POSTGRES.getUsername()); source.setPassword(POSTGRES.getPassword());
        var repository = new com.smartrecruitment.core.catalog.infrastructure.persistence.JooqCategoryRepository(
                DSL.using(source, SQLDialect.POSTGRES), tools.jackson.databind.json.JsonMapper.builder().build());
        var service = new com.smartrecruitment.core.catalog.application.CategoryService(repository);
        Long actor = com.smartrecruitment.core.support.TestIds.next();
        var rootKind = com.smartrecruitment.core.catalog.domain.CategoryKind.INDUSTRY;
        var groupKind = com.smartrecruitment.core.catalog.domain.CategoryKind.SPECIALIZATION;
        var positionKind = com.smartrecruitment.core.catalog.domain.CategoryKind.POSITION;
        var root = service.create(actor, rootKind, null, "QA industry " + com.smartrecruitment.core.support.TestIds.next(), "Synthetic test creation", null);
        var group = service.create(actor, groupKind, root.id(), "QA group", "Synthetic test creation", null);
        var target = service.create(actor, groupKind, root.id(), "QA canonical group", "Synthetic test creation", null);
        var proposal = service.propose(actor, positionKind, group.id(), "New position");
        assertThat(service.propose(actor, positionKind, group.id(), "  New   position ").id()).isEqualTo(proposal.id());
        assertThat(service.list(false)).noneMatch(entry -> entry.id().equals(proposal.id()));
        service.act(actor, proposal.id(), 0, "APPROVE", null, null, "Synthetic approval", null);
        service.act(actor, group.id(), 0, "MERGE", null, target.id(), "Synthetic duplicate merge", null);
        assertThat(service.active(proposal.id(), positionKind, target.id()).parentId()).isEqualTo(target.id());
        assertThat(service.list(false).stream().filter(entry -> entry.id().equals(proposal.id())).findFirst().orElseThrow().parentId())
                .isEqualTo(target.id());
        assertThat(repository.find(proposal.id()).orElseThrow().parentId()).isEqualTo(group.id());
        assertThat(service.history(proposal.id())).hasSize(2);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.act(actor, proposal.id(), 0, "EDIT", "Changed", null, "Synthetic stale edit", null))
                .isInstanceOf(com.smartrecruitment.core.catalog.application.CategoryConflictException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.create(actor, positionKind, root.id(), "Wrong parent", "Synthetic wrong parent", null))
                .isInstanceOf(IllegalArgumentException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.act(actor, root.id(), 0, "MERGE", null,
                com.smartrecruitment.core.catalog.domain.CategoryEntry.IT_INDUSTRY_ID, "Synthetic scope guard", null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void newPositionsCanBeUsedImmediatelyButApprovalDoesNotChangeOutsideIndustrySnapshot() {
        var source = new PGSimpleDataSource();
        source.setURL(POSTGRES.getJdbcUrl()); source.setUser(POSTGRES.getUsername()); source.setPassword(POSTGRES.getPassword());
        var repository = new com.smartrecruitment.core.catalog.infrastructure.persistence.JooqCategoryRepository(
                DSL.using(source, SQLDialect.POSTGRES), tools.jackson.databind.json.JsonMapper.builder().build());
        var service = new com.smartrecruitment.core.catalog.application.CategoryService(repository);
        Long actor = com.smartrecruitment.core.support.TestIds.next();
        var it = service.resolve(actor, new com.smartrecruitment.core.catalog.domain.CategoryChoice(
                com.smartrecruitment.core.catalog.domain.CategoryEntry.IT_INDUSTRY_ID, null,
                11L, null, null, "QA unknown role " + com.smartrecruitment.core.support.TestIds.next()), "New role");
        assertThat(it.supportsMatching()).isTrue();
        assertThat(it.positionId()).isNull();
        var industryName = "QA other industry " + com.smartrecruitment.core.support.TestIds.next();
        var outside = service.resolve(actor, new com.smartrecruitment.core.catalog.domain.CategoryChoice(
                null, industryName, null, null, null, "Accounting"), "Accountant");
        assertThat(outside.supportsMatching()).isFalse();
        var proposal = service.list(true).stream().filter(entry -> entry.name().equals(industryName)).findFirst().orElseThrow();
        service.act(actor, proposal.id(), 0, "APPROVE", null, null, "Synthetic approval", null);
        assertThat(outside.industryId()).isNull();
        assertThat(outside.supportsMatching()).isFalse();
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
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        Company company = companies.insertWithOwner(Company.create(owner, "Invitation Test Legal",
                "Invitation Test", "invitation-migration-test", null, null, "VN", null, null), owner);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        CompanyInvitation invitation = invitations.insert(CompanyInvitation.create(company.id(),
                "member@example.com", "member@example.com", "RECRUITER", "a".repeat(64), owner,
                now, now.plusDays(7)));
        Long invitedUser = com.smartrecruitment.core.support.TestIds.next();

        var member = invitations.accept(invitation, invitedUser, now.plusSeconds(1));

        assertThat(member).isPresent();
        assertThat(member.orElseThrow().role()).isEqualTo("RECRUITER");
        assertThat(companies.findMember(company.id(), invitedUser)).isPresent();
        assertThat(invitations.findActiveByTokenHash("a".repeat(64), now.plusSeconds(2))).isEmpty();
        assertThat(invitations.accept(invitation, com.smartrecruitment.core.support.TestIds.next(), now.plusSeconds(2))).isEmpty();
    }

    @Test
    void notificationsAreDeduplicatedOwnedAndVersionedOnPostgres() {
        var dataSource = new PGSimpleDataSource();
        dataSource.setURL(POSTGRES.getJdbcUrl());
        dataSource.setUser(POSTGRES.getUsername());
        dataSource.setPassword(POSTGRES.getPassword());
        var notifications = new JooqNotificationRepository(DSL.using(dataSource, SQLDialect.POSTGRES));
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        Long other = com.smartrecruitment.core.support.TestIds.next();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        notifications.insert(owner, "TEST", "Test notification", "Notification body", "/",
                "notification-test", now);
        notifications.insert(owner, "TEST", "Test notification", "Notification body", "/",
                "notification-test", now);

        var feed = notifications.findAll(owner, 50);
        assertThat(feed).hasSize(1);
        assertThat(notifications.countUnread(owner)).isOne();
        assertThat(notifications.markRead(other, feed.getFirst().id(), 0, now.plusSeconds(1))).isFalse();
        assertThat(notifications.markRead(owner, feed.getFirst().id(), 0, now.plusSeconds(1))).isTrue();
        assertThat(notifications.countUnread(owner)).isZero();
        assertThat(notifications.markRead(owner, feed.getFirst().id(), 0, now.plusSeconds(2))).isFalse();
    }
}
