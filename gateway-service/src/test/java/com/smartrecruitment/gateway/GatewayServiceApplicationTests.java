package com.smartrecruitment.gateway;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;

import java.io.IOException;
import java.net.InetSocketAddress;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayServiceApplicationTests {
    private static HttpServer authServiceStub;

    @DynamicPropertySource
    static void configureAuthServiceStub(DynamicPropertyRegistry properties) throws IOException {
        authServiceStub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        authServiceStub.createContext("/", exchange -> {
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        authServiceStub.start();
        properties.add("AUTH_SERVICE_URL",
                () -> "http://127.0.0.1:" + authServiceStub.getAddress().getPort());
    }

    @AfterAll
    static void stopAuthServiceStub() {
        if (authServiceStub != null) {
            authServiceStub.stop(0);
        }
    }

    @LocalServerPort
    private int port;

    @Autowired
    private RouteDefinitionLocator routes;

    @Test
    void contextLoadsWithConfiguredRoutes() {
        var coreRoute = routes.getRouteDefinitions().filter(route -> "core-service".equals(route.getId()))
                .blockFirst();
        assertThat(coreRoute).isNotNull();
        var routedPaths = coreRoute.getPredicates().stream()
                .flatMap(predicate -> predicate.getArgs().values().stream())
                .toList();
        assertThat(routedPaths).contains(
                "/api/v1/notifications/**",
                "/api/v1/dashboard/**");
    }

    @Test
    void accountRecoveryRoutesArePublicButAccountManagementRemainsProtected() {
        WebTestClient client = WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + port)
                .build();

        assertForwardedInsteadOfRejected(client, "/api/v1/auth/resend-verification",
                "{\"email\":\"pending@example.com\"}");
        assertForwardedInsteadOfRejected(client, "/api/v1/auth/forgot-password",
                "{\"email\":\"active@example.com\"}");
        assertForwardedInsteadOfRejected(client, "/api/v1/auth/reset-password",
                "{\"token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\","
                        + "\"newPassword\":\"NewPassword!2026\"}");

        client.post().uri("/api/v1/auth/change-password")
                .header("Content-Type", "application/json")
                .bodyValue("{\"currentPassword\":\"Current!2026\",\"newPassword\":\"NewPassword!2026\"}")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    private static void assertForwardedInsteadOfRejected(WebTestClient client, String path, String body) {
        client.post().uri(path)
                .header("Content-Type", "application/json")
                .bodyValue(body)
                .exchange()
                .expectStatus().value(status -> assertThat(status).isNotIn(401, 403));
    }
}
