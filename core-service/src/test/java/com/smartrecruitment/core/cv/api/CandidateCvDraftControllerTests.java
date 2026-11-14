package com.smartrecruitment.core.cv.api;

import com.smartrecruitment.core.cv.application.CvDraftConflictException;
import com.smartrecruitment.core.cv.application.CvDraftNotFoundException;
import com.smartrecruitment.core.cv.application.CvDraftService;
import com.smartrecruitment.core.cv.application.CvService;
import com.smartrecruitment.core.cv.domain.CvDraft;
import com.smartrecruitment.core.cv.domain.CvDraftEntry;
import com.smartrecruitment.core.cv.domain.CvDraftPayload;
import com.smartrecruitment.core.cv.domain.CvDraftSection;
import com.smartrecruitment.core.cv.domain.CvDraftTemplate;
import com.smartrecruitment.core.shared.api.GlobalExceptionHandler;
import com.smartrecruitment.core.shared.config.BusinessIdentityJsonConfig;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import tools.jackson.databind.json.JsonMapper;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CandidateCvDraftControllerTests {
    private static final long CANDIDATE_ID = 1001L;
    private static final long DRAFT_ID = 9007199254740993L;

    @Test
    void routesDraftEndpointsSeparatelyFromCvIdsAndSerializesBigintIdsAsStrings() throws Exception {
        var draftService = mock(CvDraftService.class);
        var cvService = mock(CvService.class);
        var sample = sampleDraft(0L);
        when(draftService.listMine(CANDIDATE_ID)).thenReturn(List.of(sample));
        when(draftService.create(eq(CANDIDATE_ID), eq("CV Backend"), eq(CvDraftTemplate.MODERN),
                eq("#0f766e"), any(), any())).thenReturn(sample);
        when(draftService.update(eq(CANDIDATE_ID), eq(DRAFT_ID), eq(0L), eq("CV Backend"),
                eq(CvDraftTemplate.MODERN), eq("#0f766e"), any(), any())).thenReturn(sampleDraft(1L));
        doNothing().when(draftService).delete(CANDIDATE_ID, DRAFT_ID, 1L);

        var mvc = mvc(draftService, cvService);

        mvc.perform(get("/api/v2/cvs/drafts"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].draftId").value(Long.toString(DRAFT_ID)))
                .andExpect(jsonPath("$[0].candidateUserId").value("1001"))
                .andExpect(jsonPath("$[0].templateId").value("modern"));

        mvc.perform(post("/api/v2/cvs/drafts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody(null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.draftId").value(Long.toString(DRAFT_ID)))
                .andExpect(jsonPath("$.version").value(0));

        mvc.perform(put("/api/v2/cvs/drafts/{draftId}", DRAFT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody(0L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        mvc.perform(delete("/api/v2/cvs/drafts/{draftId}", DRAFT_ID).param("version", "1"))
                .andExpect(status().isNoContent());

        verify(draftService).delete(CANDIDATE_ID, DRAFT_ID, 1L);
    }

    @Test
    void mapsNotFoundConflictAndValidationErrors() throws Exception {
        var draftService = mock(CvDraftService.class);
        var cvService = mock(CvService.class);
        when(draftService.getMine(CANDIDATE_ID, DRAFT_ID)).thenThrow(new CvDraftNotFoundException());
        when(draftService.update(eq(CANDIDATE_ID), eq(DRAFT_ID), eq(0L), any(), any(), any(), any(), any()))
                .thenThrow(new CvDraftConflictException());

        var mvc = mvc(draftService, cvService);

        mvc.perform(get("/api/v2/cvs/drafts/{draftId}", DRAFT_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CV_DRAFT_NOT_FOUND"));

        mvc.perform(put("/api/v2/cvs/drafts/{draftId}", DRAFT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody(0L)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CV_DRAFT_CONFLICT"));

        mvc.perform(put("/api/v2/cvs/drafts/{draftId}", DRAFT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBody(null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CV_DRAFT_INVALID"));

        mvc.perform(post("/api/v2/cvs/drafts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validRequestBodyWithPhoto("https://evil.example/a.png")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CV_DRAFT_INVALID"));
    }

    private MockMvc mvc(CvDraftService draftService, CvService cvService) {
        var jwt = Jwt.withTokenValue("synthetic").header("alg", "none")
                .subject(Long.toString(CANDIDATE_ID)).claim("roles", List.of("CANDIDATE")).build();
        var mapper = JsonMapper.builder()
                .addModule(new BusinessIdentityJsonConfig().businessIdentityModule())
                .build();
        return MockMvcBuilders
                .standaloneSetup(new CandidateCvDraftController(draftService), new CandidateCvController(cvService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new JacksonJsonHttpMessageConverter(mapper))
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType() == Jwt.class;
                    }

                    @Override
                    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                                                  NativeWebRequest request, WebDataBinderFactory factory) {
                        return jwt;
                    }
                })
                .build();
    }

    private static CvDraft sampleDraft(long version) {
        var now = OffsetDateTime.of(2026, 11, 14, 2, 0, 0, 0, ZoneOffset.UTC);
        var payload = new CvDraftPayload(
                "Nguyễn Minh An", "Backend Engineer", "an@example.invalid", "0901234567", "TP. HCM", "",
                "Giới thiệu", "Java",
                List.of(new CvDraftEntry("entry-1", "Dev", "Corp", "2023-01", "", true, "API")),
                List.of(), List.of(), List.of(), List.of());
        return new CvDraft(DRAFT_ID, CANDIDATE_ID, "CV Backend", CvDraftTemplate.MODERN, "#0f766e",
                CvDraftSection.defaultOrder(), payload, now, now, version);
    }

    private static String validRequestBody(Long expectedVersion) {
        return validRequestBody(expectedVersion, "");
    }

    private static String validRequestBodyWithPhoto(String photoDataUrl) {
        return validRequestBody(null, photoDataUrl);
    }

    private static String validRequestBody(Long expectedVersion, String photoDataUrl) {
        String versionField = expectedVersion == null ? "" : "\"expectedVersion\":" + expectedVersion + ",";
        return "{"
                + versionField
                + "\"title\":\"CV Backend\","
                + "\"templateId\":\"modern\","
                + "\"accentColor\":\"#0f766e\","
                + "\"sectionOrder\":[\"introduction\",\"skills\",\"experiences\",\"education\",\"projects\",\"certificates\",\"languages\"],"
                + "\"payload\":{"
                + "\"fullName\":\"Nguyễn Minh An\",\"headline\":\"Backend Engineer\",\"email\":\"an@example.invalid\","
                + "\"phone\":\"0901234567\",\"location\":\"TP. HCM\",\"links\":\"\",\"introduction\":\"Giới thiệu\",\"skills\":\"Java\","
                + "\"experiences\":[{\"id\":\"entry-1\",\"title\":\"Dev\",\"subtitle\":\"Corp\",\"startMonth\":\"2023-01\",\"endMonth\":\"\",\"current\":true,\"description\":\"API\"}],"
                + "\"education\":[],\"projects\":[],\"certificates\":[],\"languages\":[],"
                + "\"photoDataUrl\":\"" + photoDataUrl + "\","
                + "\"language\":\"vi\",\"fontSize\":\"medium\",\"lineSpacing\":\"normal\",\"hiddenSections\":[]"
                + "}}";
    }
}
