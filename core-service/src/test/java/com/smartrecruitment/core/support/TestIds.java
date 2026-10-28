package com.smartrecruitment.core.support;

import java.util.concurrent.atomic.AtomicLong;

/** Distinct business IDs for tests; message/correlation IDs continue to use Long. */
public final class TestIds {
    private static final AtomicLong NEXT = new AtomicLong(10000);
    private TestIds() { }
    public static Long next() { return NEXT.incrementAndGet(); }
}
