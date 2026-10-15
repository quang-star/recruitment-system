package com.smartrecruitment.core.catalog.infrastructure.persistence;

import com.smartrecruitment.core.catalog.application.port.CategoryRepository;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.JSONB;
import org.jooq.Record;
import org.jooq.Table;
import org.jooq.exception.IntegrityConstraintViolationException;
import org.jooq.impl.DSL;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JooqCategoryRepository implements CategoryRepository {
    private static final Table<?> CATALOG = DSL.table(DSL.name("job_category_catalog"));
    private static final Field<UUID> ID = DSL.field(DSL.name("id"), UUID.class);
    private static final Field<String> KIND = DSL.field(DSL.name("kind"), String.class);
    private static final Field<UUID> PARENT = DSL.field(DSL.name("parent_id"), UUID.class);
    private static final Field<String> NAME = DSL.field(DSL.name("name"), String.class);
    private static final Field<String> NORMALIZED = DSL.field(DSL.name("normalized_name"), String.class);
    private static final Field<String> STATUS = DSL.field(DSL.name("status"), String.class);
    private static final Field<UUID> MERGED = DSL.field(DSL.name("merged_into_id"), UUID.class);
    private static final Field<Long> VERSION = DSL.field(DSL.name("version"), Long.class);
    private final DSLContext dsl;
    private final ObjectMapper mapper;
    public JooqCategoryRepository(DSLContext dsl, ObjectMapper mapper) { this.dsl = dsl; this.mapper = mapper; }

    @Override
    public List<CategoryEntry> list(boolean includeInactive) {
        return dsl.selectFrom(CATALOG).where(includeInactive ? DSL.trueCondition() : STATUS.eq("ACTIVE"))
                .orderBy(KIND, NAME, ID).limit(1000).fetch(this::entry);
    }
    @Override
    public Optional<CategoryEntry> find(UUID id) {
        return id == null ? Optional.empty() : dsl.selectFrom(CATALOG).where(ID.eq(id)).fetchOptional(this::entry);
    }
    @Override
    public Optional<CategoryEntry> findByName(CategoryKind kind, UUID parentId, String name) {
        return dsl.selectFrom(CATALOG).where(KIND.eq(kind.name())).and(parentId == null ? PARENT.isNull() : PARENT.eq(parentId))
                .and(NORMALIZED.eq(name)).and(STATUS.in("ACTIVE", "PENDING")).fetchOptional(this::entry);
    }
    @Override
    public CategoryEntry insert(CategoryEntry entry, String normalizedName, UUID actor) {
        try {
            dsl.insertInto(CATALOG).set(ID, entry.id()).set(KIND, entry.kind().name()).set(PARENT, entry.parentId())
                    .set(NAME, entry.name()).set(NORMALIZED, normalizedName).set(STATUS, entry.status()).set(VERSION, 0L).execute();
            audit(null, entry, actor, "PENDING".equals(entry.status()) ? "PROPOSE" : "CREATE");
            return entry;
        } catch (IntegrityConstraintViolationException exception) {
            throw new DataIntegrityViolationException("Catalog name or state conflicts with current data", exception);
        }
    }
    private CategoryEntry entry(Record row) {
        return new CategoryEntry(row.get(ID), CategoryKind.valueOf(row.get(KIND)), row.get(PARENT), row.get(NAME),
                row.get(STATUS), row.get(MERGED), row.get(VERSION));
    }
    private void audit(CategoryEntry before, CategoryEntry after, UUID actor, String action) {
        dsl.insertInto(DSL.table(DSL.name("job_category_history")))
                .set(DSL.field(DSL.name("category_id"), UUID.class), after.id())
                .set(DSL.field(DSL.name("actor_user_id"), UUID.class), actor)
                .set(DSL.field(DSL.name("action"), String.class), action)
                .set(DSL.field(DSL.name("before_state"), JSONB.class), before == null ? null : JSONB.jsonb(mapper.writeValueAsString(before)))
                .set(DSL.field(DSL.name("after_state"), JSONB.class), JSONB.jsonb(mapper.writeValueAsString(after))).execute();
    }
}
