package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Transactional data conversion; missing external mappings abort the upgrade. */
public class V26__Convert_business_identity_references extends BaseJavaMigration {
    private static final Set<String> TABLES = Set.of("candidate_profiles", "recruiter_profiles", "companies",
            "company_members", "cvs", "cv_versions", "jobs", "job_versions", "applications",
            "application_status_history", "candidate_consents", "application_cv_access_grants",
            "company_invitations", "notifications", "job_category_catalog", "job_category_history",
            "cv_erasure_queue", "job_processing_projections", "application_matching_projections", "outbox_events");
    private static final Set<String> TECHNICAL = Set.of("public_id", "correlation_id", "causation_id", "event_id");
    private record Constraint(String table, String name, String definition) { }
    private record Column(String table, String name, String owner, String kind) { }

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        List<Column> columns = businessColumns(connection);
        installLookup(connection);
        // Validate every reference before changing any constraints or columns.
        for (Column column : columns) {
            execute(connection, "SELECT pg_temp.convert_business_id(" + quote(column.name()) + ", "
                    + owner(column) + ", " + kind(column) + ") FROM " + quote(column.table()));
        }
        List<Constraint> constraints = constraints(connection);
        for (Constraint constraint : constraints) {
            execute(connection, "ALTER TABLE " + quote(constraint.table()) + " DROP CONSTRAINT " + quote(constraint.name()));
        }
        for (Column column : columns) {
            execute(connection, "ALTER TABLE " + quote(column.table()) + " ALTER COLUMN " + quote(column.name())
                    + " TYPE BIGINT USING pg_temp.convert_business_id(" + quote(column.name()) + ", "
                    + owner(column) + ", " + kind(column) + ")");
        }
        for (Constraint constraint : constraints) {
            execute(connection, "ALTER TABLE " + quote(constraint.table()) + " ADD CONSTRAINT "
                    + quote(constraint.name()) + " " + constraint.definition());
        }
        rewriteJsonReferences(connection);
        execute(connection, "SELECT setval('job_category_catalog_id_seq', "
                + "GREATEST(COALESCE((SELECT MAX(id) FROM job_category_catalog), 1000), 1000))");
    }

    private static List<Column> businessColumns(Connection connection) throws SQLException {
        var columns = new ArrayList<Column>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(
                "SELECT table_name,column_name FROM information_schema.columns "
                        + "WHERE table_schema=current_schema() AND udt_name='uuid' ORDER BY table_name,ordinal_position")) {
            while (rows.next()) {
                String table = rows.getString(1), name = rows.getString(2);
                if (!TABLES.contains(table) || TECHNICAL.contains(name)) continue;
                String owner = "core", kind;
                if (name.equals("user_id") || name.endsWith("_user_id")) { owner = "auth"; kind = "user"; }
                else if (name.equals("processing_task_id")) { owner = "ai"; kind = "task"; }
                else if (name.equals("matching_result_id")) { owner = "ai"; kind = "matching_result"; }
                else if (table.equals("job_category_catalog") || name.equals("category_id")
                        || Set.of("industry_id", "specialization_id", "position_id").contains(name)) kind = "category";
                else kind = switch (name) {
                    case "cv_version_id" -> "cv_version";
                    case "job_version_id" -> "job_version";
                    case "job_id" -> "job";
                    case "application_id" -> "application";
                    case "aggregate_id" -> "aggregate";
                    default -> throw new SQLException("Unsupported business identity column: " + table + "." + name);
                };
                columns.add(new Column(table, name, owner, kind));
            }
        }
        return columns;
    }

    private static String owner(Column column) { return "'" + column.owner() + "'"; }
    private static String kind(Column column) {
        return column.kind().equals("aggregate")
                ? "CASE aggregate_type WHEN 'CV' THEN 'cv' WHEN 'JOB' THEN 'job' WHEN 'APPLICATION' THEN 'application' END"
                : "'" + column.kind() + "'";
    }

    private static List<Constraint> constraints(Connection connection) throws SQLException {
        var constraints = new ArrayList<Constraint>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(
                "SELECT t.relname,c.conname,pg_get_constraintdef(c.oid) FROM pg_constraint c "
                        + "JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace "
                        + "WHERE n.nspname=current_schema() AND c.contype IN ('f','c') ORDER BY c.contype DESC")) {
            while (rows.next()) if (TABLES.contains(rows.getString(1))) {
                constraints.add(new Constraint(rows.getString(1), rows.getString(2), rows.getString(3)));
            }
        }
        return constraints;
    }

    private static void installLookup(Connection connection) throws SQLException {
        execute(connection, """
                CREATE OR REPLACE FUNCTION pg_temp.convert_business_id(legacy UUID, owner_name TEXT, kind_name TEXT)
                RETURNS BIGINT LANGUAGE plpgsql STRICT AS $function$
                DECLARE converted BIGINT;
                BEGIN
                    SELECT entity_id INTO STRICT converted FROM legacy_identity_map
                    WHERE service=owner_name AND entity_type=kind_name AND legacy_id=legacy;
                    RETURN converted;
                EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
                    RAISE EXCEPTION 'Identity conversion requires complete, unambiguous imported %/% mappings', owner_name, kind_name;
                END $function$
                """);
    }

    private static void rewriteJsonReferences(Connection connection) throws SQLException {
        execute(connection, """
                CREATE OR REPLACE FUNCTION pg_temp.convert_identity_json(data JSONB, field_name TEXT DEFAULT '')
                RETURNS JSONB LANGUAGE plpgsql AS $function$
                DECLARE result JSONB; entry RECORD; value TEXT; converted BIGINT; variants BIGINT;
                BEGIN
                    IF jsonb_typeof(data)='object' THEN
                        result := '{}'::jsonb;
                        FOR entry IN SELECT * FROM jsonb_each(data) LOOP
                            result := result || jsonb_build_object(CASE WHEN entry.key='publicId' THEN 'id' ELSE entry.key END,
                                pg_temp.convert_identity_json(entry.value,entry.key));
                        END LOOP;
                        RETURN result;
                    ELSIF jsonb_typeof(data)='array' THEN
                        SELECT COALESCE(jsonb_agg(pg_temp.convert_identity_json(element,field_name) ORDER BY ordinal),'[]'::jsonb)
                        INTO result FROM jsonb_array_elements(data) WITH ORDINALITY AS items(element,ordinal);
                        RETURN result;
                    ELSIF jsonb_typeof(data)='string' AND
                        (field_name ~ '(Id|Ids|_id|_ids)$' OR field_name IN ('id','publicId')) AND
                        field_name NOT IN ('eventId','correlationId','causationId','evidenceId','evidenceIds','leaseToken') THEN
                        value := data #>> '{}';
                        IF value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                            SELECT MIN(entity_id),COUNT(DISTINCT entity_id) INTO converted,variants
                            FROM legacy_identity_map WHERE legacy_id=value::uuid;
                            IF variants<>1 THEN RAISE EXCEPTION 'Identity conversion requires complete, unambiguous JSON mappings'; END IF;
                            RETURN to_jsonb(converted::text);
                        END IF;
                    END IF;
                    RETURN data;
                END $function$
                """);
        for (String[] target : List.of(new String[]{"outbox_events", "payload"},
                new String[]{"job_category_history", "before_state"}, new String[]{"job_category_history", "after_state"},
                new String[]{"application_matching_projections", "explanation"}, new String[]{"application_matching_projections", "quality_flags"})) {
            execute(connection, "UPDATE " + quote(target[0]) + " SET " + quote(target[1])
                    + "=pg_temp.convert_identity_json(" + quote(target[1]) + "::jsonb)");
        }
    }

    private static String quote(String name) { return "\"" + name.replace("\"", "\"\"") + "\""; }
    private static void execute(Connection connection, String sql) throws SQLException {
        try (var statement = connection.createStatement()) { statement.execute(sql); }
    }
}
