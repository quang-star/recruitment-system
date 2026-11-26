package com.smartrecruitment.auth.user.infrastructure.http;

import com.smartrecruitment.auth.user.application.CompanyInvitationAcceptanceException;
import com.smartrecruitment.auth.user.application.CompanyInvitationAcceptanceException.Reason;
import com.smartrecruitment.auth.user.application.port.CompanyInvitationClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

@Component
public class CoreCompanyInvitationClient implements CompanyInvitationClient {
    private final RestClient core;

    public CoreCompanyInvitationClient(@Value("${CORE_SERVICE_URL:http://core-service:8082}") String coreUrl) {
        var requests = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3)).build());
        requests.setReadTimeout(Duration.ofSeconds(5));
        this.core = RestClient.builder().baseUrl(coreUrl).requestFactory(requests).build();
    }

    @Override
    public Membership accept(String accessToken, String token) {
        try {
            var member = core.post().uri("/api/v2/companies/invitations/accept-for-account")
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("token", token))
                    .retrieve().body(Membership.class);
            if (member == null) throw new CompanyInvitationAcceptanceException(Reason.UNAVAILABLE);
            return member;
        } catch (RestClientResponseException exception) {
            throw new CompanyInvitationAcceptanceException(switch (exception.getStatusCode().value()) {
                case 404 -> Reason.NOT_FOUND;
                case 409 -> Reason.CONFLICT;
                default -> Reason.UNAVAILABLE;
            });
        } catch (RestClientException exception) {
            throw new CompanyInvitationAcceptanceException(Reason.UNAVAILABLE);
        }
    }
}
