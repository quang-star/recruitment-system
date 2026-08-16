package com.smartrecruitment.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

@Component
public class CorrelationIdFilter implements GlobalFilter, Ordered {
    public static final String HEADER_NAME = "X-Correlation-Id";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String correlationId = normalize(exchange.getRequest().getHeaders().getFirst(HEADER_NAME));
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> headers.set(HEADER_NAME, correlationId))
                .build();
        exchange.getResponse().getHeaders().set(HEADER_NAME, correlationId);
        return chain.filter(exchange.mutate().request(request).build());
    }

    static String normalize(String candidate) {
        if (candidate != null) {
            try {
                return UUID.fromString(candidate).toString();
            } catch (IllegalArgumentException ignored) {
                // Invalid external identifiers are replaced at the trust boundary.
            }
        }
        return UUID.randomUUID().toString();
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
