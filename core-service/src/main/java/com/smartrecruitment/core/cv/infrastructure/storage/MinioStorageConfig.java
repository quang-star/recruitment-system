package com.smartrecruitment.core.cv.infrastructure.storage;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioStorageConfig {
    @Bean
    MinioClient minioClient(@Value("${core.storage.endpoint}") String endpoint,
                            @Value("${core.storage.access-key}") String accessKey,
                            @Value("${core.storage.secret-key}") String secretKey) {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
