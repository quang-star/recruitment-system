package com.smartrecruitment.core.shared;

import com.smartrecruitment.core.catalog.domain.CategoryEntry;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.shared.config.BusinessIdentityJsonConfig;
import com.smartrecruitment.core.shared.domain.BusinessIds;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BusinessIdentityJsonTests {
    record Example(Long id, Long applicationId, Long version, Long resultGeneration, long total, UUID correlationId) { }

    @Test
    void preservesBigintPrecisionWhileLeavingCountersAndTechnicalIdsUnchanged() {
        var mapper = JsonMapper.builder().addModule(new BusinessIdentityJsonConfig().businessIdentityModule()).build();
        UUID correlation = UUID.randomUUID();
        var value = new Example(Long.MAX_VALUE, 9007199254740993L, 2L, 3L, 4L, correlation);
        var json = mapper.readTree(mapper.writeValueAsString(value));
        assertThat(json.get("id").isString()).isTrue();
        assertThat(json.get("id").asString()).isEqualTo("9223372036854775807");
        assertThat(json.get("applicationId").asString()).isEqualTo("9007199254740993");
        assertThat(json.get("version").isIntegralNumber()).isTrue();
        assertThat(json.get("resultGeneration").isIntegralNumber()).isTrue();
        assertThat(json.get("total").asLong()).isEqualTo(4L);
        assertThat(json.get("correlationId").asString()).isEqualTo(correlation.toString());
        assertThat(mapper.readValue(mapper.writeValueAsString(value), Example.class)).isEqualTo(value);
        assertThat(mapper.readTree(mapper.writeValueAsString(Map.of("total", 4L))).get("total").isIntegralNumber()).isTrue();
    }

    @Test
    void serializesCatalogIdentitiesWithoutAddingTransportDependenciesToTheDomain() {
        var mapper = JsonMapper.builder().addModule(new BusinessIdentityJsonConfig().businessIdentityModule()).build();
        var category = new CategoryEntry(11L, CategoryKind.SPECIALIZATION, 1L, "Software", "ACTIVE", null, 2);
        var json = mapper.readTree(mapper.writeValueAsString(category));
        assertThat(json.get("id").asString()).isEqualTo("11");
        assertThat(json.get("parentId").asString()).isEqualTo("1");
        assertThat(json.get("mergedIntoId").isNull()).isTrue();
        assertThat(json.get("version").asLong()).isEqualTo(2L);
    }

    @Test
    void rejectsNonCanonicalAndOverflowIdentityStrings() {
        assertThat(BusinessIds.parse("9223372036854775807")).isEqualTo(Long.MAX_VALUE);
        for (String invalid : new String[]{null, "0", "01", "-1", "+1", "1.5", " 1", "9223372036854775808", UUID.randomUUID().toString()}) {
            assertThatThrownBy(() -> BusinessIds.parse(invalid)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
