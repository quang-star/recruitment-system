package com.smartrecruitment.auth.user.infrastructure.persistence;

import org.jooq.Field;
import org.jooq.impl.DSL;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Keeps database update timestamps monotonic relative to creation/issuance floors when
 * host/VM wall clocks step backward across CPU cores or requests.
 */
final class TimestampGuards {

    private TimestampGuards() {
    }

    static Field<OffsetDateTime> atLeast(Field<OffsetDateTime> floor, Instant instant) {
        return DSL.greatest(floor, DSL.val(instant.atOffset(ZoneOffset.UTC), floor));
    }
}
