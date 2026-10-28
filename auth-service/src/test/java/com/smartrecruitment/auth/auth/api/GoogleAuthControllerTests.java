package com.smartrecruitment.auth.auth.api;

import com.smartrecruitment.auth.user.application.GoogleSignInException;
import com.smartrecruitment.auth.user.application.GoogleSignInService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GoogleAuthControllerTests {
    private final GoogleSignInService service = mock(GoogleSignInService.class);
    private MockMvc http;

    @BeforeEach
    void setUp() {
        http = MockMvcBuilders.standaloneSetup(new GoogleAuthController(service))
                .setControllerAdvice(new AuthExceptionHandler()).build();
    }

    @Test
    void returnsPublicClientIdAndNonCachedChallenge() throws Exception {
        when(service.clientId()).thenReturn("public-client-id");
        when(service.challenge()).thenReturn(new GoogleSignInService.Challenge("n".repeat(64), Instant.now().plusSeconds(300)));
        http.perform(get("/api/v2/auth/google/config")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.clientId").value("public-client-id"));
        http.perform(post("/api/v2/auth/google/challenge")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.nonce").value("n".repeat(64)));
    }

    @Test
    void rejectsMissingNonceOversizedTokenAndAdminRoleBeforeCallingService() throws Exception {
        String prefix = "{\"credential\":\"token\",\"nonce\":\"" + "n".repeat(64) + "\",";
        for (String body : new String[] {
                "{\"credential\":\"token\"}",
                prefix + "\"accountType\":\"SYSTEM_ADMIN\"}",
                "{\"credential\":\"" + "x".repeat(16385) + "\",\"nonce\":\"" + "n".repeat(64) + "\"}" }) {
            http.perform(post("/api/v2/auth/google/login").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        verifyNoInteractions(service);
    }

    @Test
    void returnsActionableLinkRequiredErrorWithoutEchoingGoogleCredential() throws Exception {
        when(service.login(anyString(), anyString(), isNull(), any(), any()))
                .thenThrow(new GoogleSignInException(GoogleSignInException.Reason.LINK_REQUIRED));
        http.perform(post("/api/v2/auth/google/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"credential\":\"sensitive-provider-token\",\"nonce\":\"" + "n".repeat(64) + "\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("GOOGLE_LINK_REQUIRED"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("sensitive-provider-token"))));
    }
}
