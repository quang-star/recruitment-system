package com.smartrecruitment.core.shared.infrastructure.persistence;

import org.jooq.Field;
import org.jooq.impl.DSL;

import java.time.OffsetDateTime;

/**
 * Keeps database update timestamps monotonic relative to creation/action floors when
 * host/VM wall clocks step backward across CPU cores or requests.
 */
public final class TimestampGuards {

    private TimestampGuards() {
    }

    public static Field<OffsetDateTime> atLeast(Field<OffsetDateTime> floor, OffsetDateTime timestamp) {
        return DSL.greatest(floor, DSL.val(timestamp, floor));
    }

    public static Field<OffsetDateTime> atLeast(Field<OffsetDateTime> floorA, Field<OffsetDateTime> floorB,
                                                OffsetDateTime timestamp) {
        return DSL.greatest(floorA, floorB, DSL.val(timestamp, floorA));
    }

    public static OffsetDateTime laterOf(OffsetDateTime floor, OffsetDateTime candidate) {
        if (floor == null) {
            return candidate;
        }
        return candidate == null || candidate.isBefore(floor) ? floor : candidate;
    }
}
