package com.smartrecruitment.auth.database;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
class AuthIdentityMigrationTests {
    @Autowired private DataSource dataSource;

    @Test
    void preservesExistingKeysAndTheLegacyMappingWhenUpgradingFromV5() {
        // This schema exists only in the disposable Testcontainers database.
        String schema = "identity_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                .target("5").load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        UUID userUuid = UUID.randomUUID();
        Long userId = jdbc.queryForObject("INSERT INTO " + schema + ".auth_users "
                + "(public_id,email,normalized_email,status) VALUES (?,?,?,'ACTIVE') RETURNING id",
                Long.class, userUuid, "migration@example.com", "migration@example.com");
        UUID sessionUuid = UUID.randomUUID();
        Long sessionId = jdbc.queryForObject("INSERT INTO " + schema + ".auth_sessions "
                + "(public_id,user_id,client_type,authenticated_at,last_seen_at,idle_expires_at,absolute_expires_at) "
                + "VALUES (?,?,'WEB',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,"
                + "CURRENT_TIMESTAMP + INTERVAL '1 day',CURRENT_TIMESTAMP + INTERVAL '2 days') RETURNING id",
                Long.class, sessionUuid, userId);

        UUID auditUuid = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".auth_audit_logs(public_id,action,outcome,resource_type,resource_id,correlation_id) "
                + "VALUES (?,'SYNTHETIC','SUCCEEDED','AUTH_USER',?,?)", auditUuid, userUuid, UUID.randomUUID());
        Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                .target("7").load().migrate();

        assertThat(jdbc.queryForObject("SELECT id FROM " + schema + ".auth_users WHERE email=?",
                Long.class, "migration@example.com")).isEqualTo(userId);
        assertThat(jdbc.queryForObject("SELECT user_id FROM " + schema + ".auth_sessions WHERE id=?",
                Long.class, sessionId)).isEqualTo(userId);
        assertThat(jdbc.queryForObject("SELECT entity_id FROM " + schema + ".legacy_identity_map "
                + "WHERE service='auth' AND entity_type='user' AND legacy_id=?", Long.class, userUuid)).isEqualTo(userId);
        assertThat(jdbc.queryForObject("SELECT entity_id FROM " + schema + ".legacy_identity_map "
                + "WHERE service='auth' AND entity_type='session' AND legacy_id=?", Long.class, sessionUuid)).isEqualTo(sessionId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM information_schema.columns "
                + "WHERE table_schema=? AND column_name='public_id'", Long.class, schema)).isZero();
        assertThat(jdbc.queryForObject("SELECT resource_id FROM " + schema + ".auth_audit_logs",
                Long.class)).isEqualTo(userId);
        assertThat(jdbc.queryForObject("SELECT data_type FROM information_schema.columns "
                + "WHERE table_schema=? AND table_name='outbox_events' AND column_name='event_id'",
                String.class, schema)).isEqualTo("uuid");
    }
}
