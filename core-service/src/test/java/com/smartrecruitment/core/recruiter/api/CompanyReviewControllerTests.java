package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.application.CompanyReviewService;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CompanyReviewControllerTests {
    @Test
    void adminApprovalUsesTheAuthenticatedActorShownVersionAndCorrelation() throws Exception {
        var service = mock(CompanyReviewService.class);
        var correlation = UUID.randomUUID();
        long companyId = 9007199254740993L;
        when(service.approve(9L, companyId, 7, "Reviewed", correlation)).thenReturn(new Company(companyId,
                "Synthetic Legal", "Synthetic Company", "synthetic", null, null, "VN", null, null,
                null, null, CompanyStatus.ACTIVE, CompanyVerificationStatus.UNVERIFIED, 11L, 8));
        mvc(service, "SYSTEM_ADMIN").perform(post("/api/v2/dashboard/companies/{id}/approve", companyId)
                .requestAttr(CorrelationIdFilter.REQUEST_ATTRIBUTE, correlation.toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":7,\"reason\":\"Reviewed\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.verificationStatus").value("UNVERIFIED"))
                .andExpect(jsonPath("$.version").value(8));
        verify(service).approve(9L, companyId, 7, "Reviewed", correlation);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CANDIDATE", "RECRUITER", ""})
    void everyEndpointRequiresSystemAdmin(String role) throws Exception {
        var service = mock(CompanyReviewService.class);
        var mvc = mvc(service, role);
        mvc.perform(get("/api/v2/dashboard/companies")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v2/dashboard/companies/3/history")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v2/dashboard/companies/3/approve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"version\":0,\"reason\":\"Reviewed\"}")).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void adminApprovalRejectsMissingReasonAndNegativeOrMissingVersion() throws Exception {
        var service = mock(CompanyReviewService.class);
        var mvc = mvc(service, "SYSTEM_ADMIN");
        for (var body : List.of("{}", "{\"version\":0,\"reason\":\" \"}", "{\"version\":-1,\"reason\":\"Reviewed\"}")) {
            mvc.perform(post("/api/v2/dashboard/companies/3/approve").contentType(MediaType.APPLICATION_JSON)
                    .content(body)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    private MockMvc mvc(CompanyReviewService service, String role) {
        var jwt = Jwt.withTokenValue("synthetic").header("alg", "none").subject("9")
                .claim("roles", role.isEmpty() ? List.of() : List.of(role)).build();
        return MockMvcBuilders.standaloneSetup(new CompanyReviewController(service))
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    public boolean supportsParameter(MethodParameter parameter) { return parameter.getParameterType() == Jwt.class; }
                    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                            NativeWebRequest request, WebDataBinderFactory factory) { return jwt; }
                }).build();
    }
}
