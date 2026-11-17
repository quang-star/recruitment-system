package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.job.api.JobDiscoveryController;
import com.smartrecruitment.core.shared.config.BusinessIdentityJsonConfig;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class JobDiscoveryApiTests {
    @Test
    void returnsDiscoveryAndKeepsLargeCategoryIdentitiesPrecise() throws Exception {
        var discovery = new JobDiscovery(List.of("Cần Thơ"), List.of(
                new JobDiscovery.Category(9007199254740993L, null, "Công nghệ thông tin", 14)));
        var service = mock(JobService.class);
        when(service.publishedDiscovery()).thenReturn(discovery);
        var mvc = MockMvcBuilders.standaloneSetup(new JobDiscoveryController(service)).build();
        mvc.perform(get("/api/v2/public/jobs/discovery")).andExpect(status().isOk())
                .andExpect(jsonPath("$.locations[0]").value("Cần Thơ"))
                .andExpect(jsonPath("$.categories[0].jobCount").value(14));
        verify(service).publishedDiscovery();
        var mapper = JsonMapper.builder().addModule(new BusinessIdentityJsonConfig().businessIdentityModule()).build();
        var json = mapper.readTree(mapper.writeValueAsString(discovery));
        assertThat(json.at("/categories/0/industryId").asString()).isEqualTo("9007199254740993");
        assertThat(json.at("/categories/0/industryId").isString()).isTrue();
        assertThat(json.at("/categories/0/jobCount").isIntegralNumber()).isTrue();
    }
}
