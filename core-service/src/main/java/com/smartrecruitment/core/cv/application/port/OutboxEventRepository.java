package com.smartrecruitment.core.cv.application.port;

import com.smartrecruitment.core.cv.application.CvUploadedEvent;

public interface OutboxEventRepository {
    void append(CvUploadedEvent event);
}
