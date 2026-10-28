package com.smartrecruitment.core.application.api;

import com.smartrecruitment.core.application.application.ApplicationCvAccessService;
import com.smartrecruitment.core.application.application.ApplicationCvDownload;
import com.smartrecruitment.core.application.application.ApplicationService;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RecruiterCvDownloadTests {
    @Test
    void writesPdfSynchronouslyAndClosesEveryAuthorizedDownload() throws Exception {
        var service = mock(ApplicationCvAccessService.class);
        var owner = com.smartrecruitment.core.support.TestIds.next();
        var application = com.smartrecruitment.core.support.TestIds.next();
        var bytes = "%PDF-1.4 synthetic".getBytes(StandardCharsets.UTF_8);
        var source = spy(new ByteArrayInputStream(bytes));
        when(service.download(owner, application)).thenReturn(new ApplicationCvDownload(
                com.smartrecruitment.core.support.TestIds.next(), "CV mẫu.pdf", bytes.length, source));
        var jwt = Jwt.withTokenValue("synthetic").header("alg", "none").subject(owner.toString()).build();
        var mvc = MockMvcBuilders.standaloneSetup(new RecruiterApplicationController(
                mock(ApplicationService.class), service)).setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
            @Override public boolean supportsParameter(MethodParameter parameter) { return parameter.getParameterType() == Jwt.class; }
            @Override public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                    NativeWebRequest request, WebDataBinderFactory factory) { return jwt; }
        }).build();

        mvc.perform(get("/api/v2/recruiter/applications/{id}/cv", application))
                .andExpect(status().isOk()).andExpect(request().asyncNotStarted())
                .andExpect(content().contentType("application/pdf"))
                .andExpect(header().longValue("Content-Length", bytes.length))
                .andExpect(content().bytes(bytes));
        verify(service).download(owner, application);
        verify(source).close();
    }
}
