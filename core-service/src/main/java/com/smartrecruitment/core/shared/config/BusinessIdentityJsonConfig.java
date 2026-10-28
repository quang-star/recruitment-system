package com.smartrecruitment.core.shared.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.BeanDescription;
import tools.jackson.databind.JacksonModule;
import tools.jackson.databind.SerializationConfig;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueSerializer;
import tools.jackson.databind.module.SimpleModule;
import tools.jackson.databind.ser.BeanPropertyWriter;
import tools.jackson.databind.ser.ValueSerializerModifier;

import java.util.List;

/** Keep BIGINT identity strings precise without changing numeric counters/versions. */
@Configuration
public class BusinessIdentityJsonConfig {
    @Bean
    public JacksonModule businessIdentityModule() {
        var serializer = new ValueSerializer<Object>() {
            @Override
            public void serialize(Object value, JsonGenerator generator, SerializationContext context) {
                generator.writeString(value.toString());
            }
        };
        return new SimpleModule("business-identity-strings").setSerializerModifier(new ValueSerializerModifier() {
            @Override
            public List<BeanPropertyWriter> changeProperties(SerializationConfig config, BeanDescription.Supplier bean,
                                                             List<BeanPropertyWriter> properties) {
                for (var property : properties) {
                    String name = property.getName();
                    Class<?> type = property.getType().getRawClass();
                    if ((type == Long.class || type == long.class) && (name.equals("id") || name.endsWith("Id"))) {
                        property.assignSerializer(serializer);
                    }
                }
                return properties;
            }
        });
    }
}
