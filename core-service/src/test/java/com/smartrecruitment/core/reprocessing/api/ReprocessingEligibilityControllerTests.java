package com.smartrecruitment.core.reprocessing.api;

import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck;
import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityService;
import com.smartrecruitment.core.reprocessing.application.port.ReprocessingEligibilityRepository.Reason;
import com.smartrecruitment.core.shared.api.GlobalExceptionHandler;
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
import org.springframework.http.MediaType;
import java.util.List;
import static com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck.Operation.PARSE_CV;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ReprocessingEligibilityControllerTests {
    private static final String PATH = "/api/v2/dashboard/reprocessing/eligibility";

    @Test
    void rejectsMissingPrincipalAndOtherRolesBeforeQueryingPrivateMetadata() {
        var service = mock(ReprocessingEligibilityService.class);
        var controller = new ReprocessingEligibilityController(service);
        var request = new ReprocessingEligibilityController.EligibilityRequest(PARSE_CV, com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), "a".repeat(64), null, null);
        assertThatThrownBy(() -> controller.check(null, request)).isInstanceOf(ResponseStatusException.class);
        for (String role : List.of("CANDIDATE", "RECRUITER", "ADMIN")) {
            assertThatThrownBy(() -> controller.check(principal(role), request)).isInstanceOf(ResponseStatusException.class);
        }
        verifyNoInteractions(service);
    }

    @Test
    void returnsOnlyEligibilityAndSafeReasonWithTheExpectedSourceMetadata() throws Exception {
        var service = mock(ReprocessingEligibilityService.class);
        when(service.check(any())).thenReturn(new ReprocessingEligibilityService.Eligibility(false, Reason.SOURCE_CHANGED));
        var mvc = MockMvcBuilders.standaloneSetup(new ReprocessingEligibilityController(service))
                .setCustomArgumentResolvers(adminResolver()).setControllerAdvice(new GlobalExceptionHandler()).build();
        Long id = com.smartrecruitment.core.support.TestIds.next(), owner = com.smartrecruitment.core.support.TestIds.next();
        mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content("""
                {"operation":"PARSE_CV","resourceId":"%s","sourceOwnerId":"%s","sourceHash":"%s"}
                """.formatted(id, owner, "a".repeat(64))))
                .andExpect(status().isOk()).andExpect(content().json("{\"eligible\":false,\"reasonCode\":\"SOURCE_CHANGED\"}"))
                .andExpect(jsonPath("$.sourceOwnerId").doesNotExist()).andExpect(jsonPath("$.sourceHash").doesNotExist())
                .andExpect(jsonPath("$.objectRef").doesNotExist());
        verify(service).check(new ReprocessingEligibilityCheck(PARSE_CV, id, owner, "a".repeat(64), null, null));
    }

    @Test
    void invalidOrIncompleteRequestsNeverReachTheEligibilityPort() throws Exception {
        var service = mock(ReprocessingEligibilityService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ReprocessingEligibilityController(service))
                .setCustomArgumentResolvers(adminResolver()).setControllerAdvice(new GlobalExceptionHandler()).build();
        String id = com.smartrecruitment.core.support.TestIds.next().toString();
        for (String request : List.of("{}", "{\"operation\":\"UNKNOWN\",\"resourceId\":\"" + id + "\"}",
                "{\"operation\":\"PARSE_CV\",\"resourceId\":\"" + id + "\"}",
                "{\"operation\":\"MATCH_APPLICATION\",\"resourceId\":\"" + id + "\"}",
                "{\"operation\":\"PARSE_JD\",\"resourceId\":\"invalid\"}")) {
            mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content(request)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    private static Jwt principal(String role) {
        return Jwt.withTokenValue("synthetic").header("alg", "RS256").subject(com.smartrecruitment.core.support.TestIds.next().toString())
                .claim("roles", List.of(role)).build();
    }

    private static HandlerMethodArgumentResolver adminResolver() {
        return new HandlerMethodArgumentResolver() {
            public boolean supportsParameter(MethodParameter parameter) {
                return parameter.getParameterType() == Jwt.class && parameter.hasParameterAnnotation(AuthenticationPrincipal.class);
            }
            public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                                          NativeWebRequest request, WebDataBinderFactory factory) { return principal("SYSTEM_ADMIN"); }
        };
    }
}
