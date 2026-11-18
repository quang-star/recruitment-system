package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.application.CompanyImageService;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.io.ByteArrayInputStream;
import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CompanyImageControllerTests {
    @Test void multipartUploadAndPublicImageRoutes() throws Exception {
        var images = mock(CompanyImageService.class);
        var id = UUID.randomUUID();
        var file = new MockMultipartFile("file", "logo.png", "image/png", new byte[]{1, 2, 3});
        var jwt = Jwt.withTokenValue("synthetic").header("alg", "none").subject("7").build();
        when(images.upload(7L, 10L, "logo", 2, file)).thenReturn(new Company(10L, "Legal", "Display",
                "display", null, null, "VN", null, null, "/image", null, CompanyStatus.PENDING,
                CompanyVerificationStatus.UNVERIFIED, 7L, 3));
        when(images.download(10L, "logo", id)).thenReturn(new ByteArrayInputStream(new byte[]{1, 2, 3}));
        var mvc = MockMvcBuilders.standaloneSetup(new CompanyImageController(images))
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    public boolean supportsParameter(MethodParameter parameter) { return parameter.getParameterType() == Jwt.class; }
                    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                                                  NativeWebRequest request, WebDataBinderFactory factory) { return jwt; }
                }).build();
        mvc.perform(multipart("/api/v2/companies/10/images/logo").file(file).param("version", "2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3));
        mvc.perform(get("/api/v2/public/companies/10/images/logo/{id}", id))
                .andExpect(status().isOk()).andExpect(content().contentType("image/png"))
                .andExpect(content().bytes(new byte[]{1, 2, 3}));
        verify(images).upload(7L, 10L, "logo", 2, file);
        verify(images).download(10L, "logo", id);
    }
}
