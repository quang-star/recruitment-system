package com.smartrecruitment.core.catalog.infrastructure.persistence;

import com.smartrecruitment.core.catalog.application.port.CategoryRepository;
import com.smartrecruitment.core.catalog.application.CategoryAuditSearch;
import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.shared.application.PageResult;
import org.jooq.DSLContext;
import org.jooq.Condition;
import org.jooq.Field;
import org.jooq.JSONB;
import org.jooq.Record;
import org.jooq.Table;
import org.jooq.exception.IntegrityConstraintViolationException;
import org.jooq.impl.DSL;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JooqCategoryRepository implements CategoryRepository {
    private static final Table<?> CATALOG = DSL.table(DSL.name("job_category_catalog"));
    private static final Table<?> HISTORY = DSL.table(DSL.name("job_category_history"));
    private static final Field<Long> ID = DSL.field(DSL.name("id"), Long.class);
    private static final Field<String> KIND = DSL.field(DSL.name("kind"), String.class);
    private static final Field<Long> PARENT = DSL.field(DSL.name("parent_id"), Long.class);
    private static final Field<String> NAME = DSL.field(DSL.name("name"), String.class);
    private static final Field<String> NORMALIZED = DSL.field(DSL.name("normalized_name"), String.class);
    private static final Field<String> STATUS = DSL.field(DSL.name("status"), String.class);
    private static final Field<Long> MERGED = DSL.field(DSL.name("merged_into_id"), Long.class);
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
    public Optional<CategoryEntry> find(Long id) {
        return id == null ? Optional.empty() : dsl.selectFrom(CATALOG).where(ID.eq(id)).fetchOptional(this::entry);
    }
    @Override
    public Optional<CategoryEntry> findByName(CategoryKind kind, Long parentId, String name) {
        return dsl.selectFrom(CATALOG).where(KIND.eq(kind.name())).and(parentId == null ? PARENT.isNull() : PARENT.eq(parentId))
                .and(NORMALIZED.eq(name)).and(STATUS.in("ACTIVE", "PENDING", "DEFERRED")).fetchOptional(this::entry);
    }
    @Override
    public CategoryEntry insert(CategoryEntry entry, String normalizedName, Long actor, String reason, UUID correlationId) {
        try {
            var saved = dsl.insertInto(CATALOG).set(KIND, entry.kind().name()).set(PARENT, entry.parentId())
                    .set(NAME, entry.name()).set(NORMALIZED, normalizedName).set(STATUS, entry.status()).set(VERSION, 0L)
                    .returningResult(ID).fetchOne();
            if (saved == null) throw new IllegalStateException("Insert category returned no identity");
            var created = new CategoryEntry(saved.get(ID), entry.kind(), entry.parentId(), entry.name(), entry.status(), null, 0);
            audit(null, created, actor, "PENDING".equals(created.status()) ? "PROPOSE" : "CREATE", reason, correlationId);
            return created;
        } catch (IntegrityConstraintViolationException exception) {
            throw new DataIntegrityViolationException("Catalog name or state conflicts with current data", exception);
        }
    }
    @Override
    public boolean update(CategoryEntry before, CategoryEntry after, String normalizedName, Long actor, String action,
                          String reason, UUID correlationId) {
        try {
            int changed = dsl.update(CATALOG).set(NAME, after.name()).set(NORMALIZED, normalizedName).set(STATUS, after.status())
                    .set(MERGED, after.mergedIntoId()).set(VERSION, after.version())
                    .set(DSL.field(DSL.name("updated_at"), OffsetDateTime.class), OffsetDateTime.now(ZoneOffset.UTC))
                    .where(ID.eq(before.id())).and(VERSION.eq(before.version())).and(STATUS.eq(before.status())).execute();
            if (changed != 1) return false;
            audit(before, after, actor, action, reason, correlationId);
            return true;
        } catch (IntegrityConstraintViolationException exception) {
            throw new DataIntegrityViolationException("Catalog name or state conflicts with current data", exception);
        }
    }
    @Override
    public List<CategoryChange> history(Long categoryId) {
        return dsl.selectFrom(HISTORY)
                .where(DSL.field(DSL.name("category_id"), Long.class).eq(categoryId))
                .orderBy(DSL.field(DSL.name("id")).desc()).limit(100).fetch(this::change);
    }
    @Override
    public PageResult<CategoryChange> searchHistory(CategoryAuditSearch search) {
        Condition condition = DSL.trueCondition();
        if (search.actorUserId() != null) condition = condition.and(DSL.field(DSL.name("actor_user_id"), Long.class).eq(search.actorUserId()));
        if (search.resourceId() != null) condition = condition.and(DSL.field(DSL.name("category_id"), Long.class).eq(search.resourceId()));
        if (search.action() != null) condition = condition.and(DSL.field(DSL.name("action"), String.class).eq(search.action()));
        if (search.correlationId() != null) condition = condition.and(DSL.field(DSL.name("correlation_id"), UUID.class).eq(search.correlationId()));
        var occurred = DSL.field(DSL.name("occurred_at"), OffsetDateTime.class);
        if (search.from() != null) condition = condition.and(occurred.ge(search.from()));
        if (search.to() != null) condition = condition.and(occurred.le(search.to()));
        var query = dsl.selectFrom(HISTORY).where(condition);
        long total = dsl.fetchCount(query);
        var items = query.orderBy(occurred.desc(), DSL.field(DSL.name("id"), Long.class).desc())
                .limit(search.size()).offset(search.offset()).fetch(this::change);
        return new PageResult<>(items, total, search.page(), search.size());
    }
    private CategoryChange change(Record row) {
        return new CategoryChange(row.get("id", Long.class), row.get("category_id", Long.class),
                row.get("actor_user_id", Long.class), row.get("action", String.class),
                row.get("before_state", String.class), row.get("after_state", String.class), row.get("occurred_at", OffsetDateTime.class),
                row.get("reason", String.class), row.get("correlation_id", UUID.class), row.get("version", Long.class));
    }
    private CategoryEntry entry(Record row) {
        return new CategoryEntry(row.get(ID), CategoryKind.valueOf(row.get(KIND)), row.get(PARENT), row.get(NAME),
                row.get(STATUS), row.get(MERGED), row.get(VERSION));
    }
    private void audit(CategoryEntry before, CategoryEntry after, Long actor, String action, String reason, UUID correlationId) {
        dsl.insertInto(DSL.table(DSL.name("job_category_history")))
                .set(DSL.field(DSL.name("category_id"), Long.class), after.id())
                .set(DSL.field(DSL.name("actor_user_id"), Long.class), actor)
                .set(DSL.field(DSL.name("action"), String.class), action)
                .set(DSL.field(DSL.name("reason"), String.class), reason)
                .set(DSL.field(DSL.name("correlation_id"), UUID.class), correlationId)
                .set(DSL.field(DSL.name("version"), Long.class), after.version())
                .set(DSL.field(DSL.name("before_state"), JSONB.class), before == null ? null : JSONB.jsonb(mapper.writeValueAsString(before)))
                .set(DSL.field(DSL.name("after_state"), JSONB.class), JSONB.jsonb(mapper.writeValueAsString(after))).execute();
    }
}
