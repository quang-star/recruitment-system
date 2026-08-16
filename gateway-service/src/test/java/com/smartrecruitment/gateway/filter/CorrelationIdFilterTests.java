package com.smartrecruitment.gateway.filter;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CorrelationIdFilterTests {
    @Test
    void keepsAValidCorrelationId() {
        String id = UUID.randomUUID().toString();
        assertThat(CorrelationIdFilter.normalize(id)).isEqualTo(id);
    }

    @Test
    void replacesAnInvalidCorrelationId() {
        assertThat(UUID.fromString(CorrelationIdFilter.normalize("not-a-uuid"))).isNotNull();
    }
}
