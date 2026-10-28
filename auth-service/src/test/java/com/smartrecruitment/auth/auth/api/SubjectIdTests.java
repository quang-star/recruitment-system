package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.shared.api.SubjectId;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SubjectIdTests {
    @Test
    void acceptsTheEntirePositiveBigintRange() {
        assertThat(SubjectId.parse("1")).isEqualTo(1L);
        assertThat(SubjectId.parse("9223372036854775807")).isEqualTo(Long.MAX_VALUE);
    }

    @Test
    void rejectsMalformedOverflowAndLegacyUuidSubjects() {
        for (String value : new String[] {null, "", "0", "-1", "+1", "01", "1.0", " 1", "1 ",
                "9223372036854775808", "b605d1b4-f751-46c4-8b33-bb5e921fc701"}) {
            assertThatThrownBy(() -> SubjectId.parse(value)).isInstanceOf(InvalidBearerTokenException.class);
        }
    }
}
