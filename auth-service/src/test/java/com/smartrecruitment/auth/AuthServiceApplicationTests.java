package com.smartrecruitment.auth;

import com.smartrecruitment.auth.support.PostgresTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
class AuthServiceApplicationTests {

    @Test
    void contextLoads() {
    }
}