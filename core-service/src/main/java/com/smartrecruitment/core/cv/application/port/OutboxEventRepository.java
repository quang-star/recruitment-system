package com.smartrecruitment.core.cv.application.port;

import com.smartrecruitment.core.cv.application.CvUploadedEvent;
import com.smartrecruitment.core.application.application.ApplicationSubmittedEvent;
import com.smartrecruitment.core.job.application.JobVersionSubmittedEvent;

public interface OutboxEventRepository {
    void append(CvUploadedEvent event);

    default void append(ApplicationSubmittedEvent event) { }
    default void append(JobVersionSubmittedEvent event) { }
}
