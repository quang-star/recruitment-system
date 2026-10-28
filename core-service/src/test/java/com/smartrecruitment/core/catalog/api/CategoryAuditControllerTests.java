package com.smartrecruitment.core.catalog.api;

import com.smartrecruitment.core.catalog.application.CategoryAuditSearch;
import com.smartrecruitment.core.catalog.application.CategoryService;
import com.smartrecruitment.core.shared.api.GlobalExceptionHandler;
import com.smartrecruitment.core.shared.application.PageResult;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CategoryAuditControllerTests {
    @Test
    void rejectsUnauthenticatedAndNonAdminAuditReadersBeforeQuerying() {
        var service = mock(CategoryService.class);
        var controller = new CategoryController(service);
        assertThatThrownBy(() -> controller.searchHistory(null, 0, 20, null, null, null, null, null, null))
                .isInstanceOf(ResponseStatusException.class);
        for (String role : List.of("CANDIDATE", "RECRUITER", "ADMIN")) {
            assertThatThrownBy(() -> controller.searchHistory(principal(role), 0, 20, null, null, null, null, null, null))
                    .isInstanceOf(ResponseStatusException.class);
        }
        verifyNoInteractions(service);
    }

    @Test
    void bindsFiltersAndReturnsDefaultAndExplicitPageMetadata() throws Exception {
        var service = mock(CategoryService.class);
        when(service.searchHistory(any())).thenAnswer(call -> {
            CategoryAuditSearch search = call.getArgument(0);
            return new PageResult<>(List.of(), 0, search.page(), search.size());
        });
        var mvc = MockMvcBuilders.standaloneSetup(new CategoryController(service))
                .setCustomArgumentResolvers(adminResolver())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(get("/api/v2/dashboard/catalog/history"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(20));
        Long actor = com.smartrecruitment.core.support.TestIds.next(), resource = com.smartrecruitment.core.support.TestIds.next();
        var correlation = java.util.UUID.randomUUID();
        mvc.perform(get("/api/v2/dashboard/catalog/history").param("page", "2").param("size", "10")
                        .param("actorUserId", actor.toString()).param("resourceId", resource.toString())
                        .param("action", " defer ").param("correlationId", correlation.toString())
                        .param("from", "2026-01-01T00:00:00Z").param("to", "2026-01-02T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isArray()).andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.page").value(2)).andExpect(jsonPath("$.size").value(10));
        verify(service).searchHistory(new CategoryAuditSearch(2, 10, actor, resource, "DEFER", correlation,
                OffsetDateTime.parse("2026-01-01T00:00:00Z"), OffsetDateTime.parse("2026-01-02T00:00:00Z")));
    }

    @Test
    void rejectsInvalidFiltersWithoutSendingARepositoryQuery() throws Exception {
        var service = mock(CategoryService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new CategoryController(service))
                .setCustomArgumentResolvers(adminResolver())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        for (String query : List.of("page=-1", "page=100001", "size=0", "size=101", "action=UNSUPPORTED", "resourceId=invalid",
                "actorUserId=invalid", "correlationId=invalid", "from=invalid", "from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z")) {
            mvc.perform(get("/api/v2/dashboard/catalog/history?" + query)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    private static Jwt principal(String role) {
        return Jwt.withTokenValue("synthetic").header("alg", "RS256").subject(com.smartrecruitment.core.support.TestIds.next().toString())
                .claim("roles", List.of(role)).build();
    }

    private static HandlerMethodArgumentResolver adminResolver() {
        return new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter parameter) {
                return parameter.getParameterType() == Jwt.class && parameter.hasParameterAnnotation(AuthenticationPrincipal.class);
            }
            @Override
            public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                                          NativeWebRequest request, WebDataBinderFactory factory) {
                return principal("SYSTEM_ADMIN");
            }
        };
    }
}
