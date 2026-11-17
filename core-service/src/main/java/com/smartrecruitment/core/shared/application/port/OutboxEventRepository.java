package com.smartrecruitment.core.shared.application.port;

import com.smartrecruitment.core.application.application.ApplicationSubmittedEvent;
import com.smartrecruitment.core.cv.application.CvUploadedEvent;
import com.smartrecruitment.core.job.application.JobVersionSubmittedEvent;
import com.smartrecruitment.core.shared.application.PrivacyEvent;

public interface OutboxEventRepository {
    void append(CvUploadedEvent event);

    default void append(ApplicationSubmittedEvent event) { }
    default void append(JobVersionSubmittedEvent event) { }
    default void append(PrivacyEvent event) { }
}
