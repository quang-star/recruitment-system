package com.smartrecruitment.core.cv.api;

import com.smartrecruitment.core.cv.application.CvService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.ResourceHttpMessageConverter;
import org.springframework.mock.http.MockHttpOutputMessage;
import org.springframework.security.oauth2.jwt.Jwt;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CandidateCvDownloadTests {
    @Test
    void streamsTheOwnedVersionWithoutCachingAndClosesTheSource() throws IOException {
        var service = mock(CvService.class);
        var owner = com.smartrecruitment.core.support.TestIds.next();
        var cv = com.smartrecruitment.core.support.TestIds.next();
        var version = com.smartrecruitment.core.support.TestIds.next();
        var bytes = "%PDF-1.4 synthetic".getBytes(StandardCharsets.UTF_8);
        var source = spy(new ByteArrayInputStream(bytes));
        when(service.downloadMine(owner, cv, version)).thenReturn(new CvService.CvDownload("CV mẫu.pdf", bytes.length, source));
        var jwt = Jwt.withTokenValue("synthetic").header("alg", "none").subject(owner.toString()).build();

        var response = new CandidateCvController(service).file(jwt, cv, version);
        assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());
        assertEquals(bytes.length, response.getHeaders().getContentLength());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertTrue(response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION).contains("filename*="));
        var output = new MockHttpOutputMessage();
        output.getHeaders().putAll(response.getHeaders());
        new ResourceHttpMessageConverter().write(response.getBody(), MediaType.APPLICATION_PDF, output);
        assertArrayEquals(bytes, output.getBodyAsBytes());
        verify(service).downloadMine(owner, cv, version);
        verify(source).close();
    }

    @Test
    void closesTheSourceWhenTheClientStopsReading() throws IOException {
        var service = mock(CvService.class);
        var source = spy(new ByteArrayInputStream(new byte[]{1, 2, 3}));
        when(service.downloadMine(any(), any(), any())).thenReturn(new CvService.CvDownload("cv.pdf", 3, source));
        var jwt = Jwt.withTokenValue("synthetic").header("alg", "none").subject(com.smartrecruitment.core.support.TestIds.next().toString()).build();
        var response = new CandidateCvController(service).file(jwt, com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next());
        var output = new MockHttpOutputMessage() {
            @Override public OutputStream getBody() {
                return new OutputStream() {
                    @Override public void write(int value) throws IOException { throw new IOException("Client disconnected"); }
                };
            }
        };
        output.getHeaders().putAll(response.getHeaders());
        assertThrows(IOException.class, () -> new ResourceHttpMessageConverter()
                .write(response.getBody(), MediaType.APPLICATION_PDF, output));
        verify(source).close();
    }
}
