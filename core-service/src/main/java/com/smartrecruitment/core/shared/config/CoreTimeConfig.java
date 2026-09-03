package com.smartrecruitment.core.shared.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class CoreTimeConfig {
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}

