package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.job.api.JobController;
import com.smartrecruitment.core.shared.api.GlobalExceptionHandler;
import com.smartrecruitment.core.shared.application.PageResult;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class JobSearchApiTests {
    @Test
    void keepsLegacyListsAndReturnsValidatedPageMetadata() throws Exception {
        var service = mock(JobService.class);
        when(service.findPublished()).thenReturn(List.of());
        when(service.searchPublished(any())).thenReturn(new PageResult<>(List.of(), 30, 2, 12));
        var mvc = MockMvcBuilders.standaloneSetup(new JobController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/api/v2/public/jobs")).andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(get("/api/v2/public/jobs?page=2&size=12&q=Java&sort=title"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(30)).andExpect(jsonPath("$.page").value(2));
        mvc.perform(get("/api/v2/public/jobs?page=0&employmentType=FULL_TIME&minSalary=10000000&maxSalary=30000000"))
                .andExpect(status().isOk());
        for (String query : List.of("page=-1", "page=100001", "page=0&size=0", "page=0&size=101",
                "page=0&sort=invalid", "page=0&q=" + "a".repeat(201), "page=abc", "page=0&workMode=invalid",
                "page=0&employmentType=invalid", "page=0&minSalary=-100", "page=0&minSalary=3000&maxSalary=1000")) {
            mvc.perform(get("/api/v2/public/jobs?" + query)).andExpect(status().isBadRequest());
        }
        verify(service, times(2)).searchPublished(any());
    }
}
