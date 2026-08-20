package com.smartrecruitment.core.cv.application.port;

import java.io.InputStream;

public interface ObjectStorage {
    void put(String objectKey, InputStream input, long size, String contentType);
    void delete(String objectKey);
}
