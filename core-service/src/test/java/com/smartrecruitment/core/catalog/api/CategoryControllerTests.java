package com.smartrecruitment.core.catalog.api;

import com.smartrecruitment.core.catalog.application.CategoryService;
import com.smartrecruitment.core.catalog.domain.CategoryKind;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CategoryControllerTests {
    @Test
    void validatesReasonsAndForwardsTrustedCorrelationForCreateAndReview() {
        var service = mock(CategoryService.class);
        var controller = new CategoryController(service);
        Long actor = com.smartrecruitment.core.support.TestIds.next(), category = com.smartrecruitment.core.support.TestIds.next();
        var correlation = java.util.UUID.randomUUID();
        var admin = Jwt.withTokenValue("synthetic").header("alg", "RS256")
                .subject(actor.toString()).claim("roles", List.of("SYSTEM_ADMIN")).build();
        var http = new MockHttpServletRequest();
        http.setAttribute(CorrelationIdFilter.REQUEST_ATTRIBUTE, correlation.toString());
        controller.create(admin, new CategoryController.CreateCategory(CategoryKind.INDUSTRY, null, "Synthetic category", "  New industry  "), http);
        verify(service).create(actor, CategoryKind.INDUSTRY, null, "Synthetic category", "New industry", correlation);
        controller.act(admin, category, new CategoryController.CategoryAction(0L, "DEFER", null, null, "  Need more evidence  "), http);
        verify(service).act(actor, category, 0, "DEFER", null, null, "Need more evidence", correlation);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            assertThat(validator.validate(new CategoryController.CreateCategory(CategoryKind.INDUSTRY, null, "Category", " \t ")))
                    .extracting(issue -> issue.getPropertyPath().toString()).contains("reason");
            assertThat(validator.validate(new CategoryController.CategoryAction(0L, "REOPEN", null, null, "x".repeat(1001))))
                    .extracting(issue -> issue.getPropertyPath().toString()).contains("reason");
            assertThat(validator.validate(new CategoryController.CategoryAction(0L, "REOPEN", null, null, "Resume review"))).isEmpty();
        }
    }

    @Test
    void restrictsCatalogAndHistoryToAdminWhileKeepingPublishedCatalogPublic() {
        var service = mock(CategoryService.class);
        var controller = new CategoryController(service);
        var candidate = Jwt.withTokenValue("synthetic").header("alg", "RS256")
                .subject(com.smartrecruitment.core.support.TestIds.next().toString()).claim("roles", List.of("CANDIDATE")).build();
        assertThatThrownBy(() -> controller.adminList(candidate)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.history(candidate, com.smartrecruitment.core.support.TestIds.next())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> controller.adminList(null)).isInstanceOf(ResponseStatusException.class);
        var unknownAdmin = Jwt.withTokenValue("synthetic").header("alg", "RS256")
                .subject(com.smartrecruitment.core.support.TestIds.next().toString()).claim("roles", List.of("ADMIN")).build();
        assertThatThrownBy(() -> controller.adminList(unknownAdmin)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(service);
        var admin = Jwt.withTokenValue("synthetic").header("alg", "RS256")
                .subject(com.smartrecruitment.core.support.TestIds.next().toString()).claim("roles", List.of("SYSTEM_ADMIN")).build();
        controller.adminList(admin);
        controller.published();
        verify(service).list(true);
        verify(service).list(false);
    }
}
