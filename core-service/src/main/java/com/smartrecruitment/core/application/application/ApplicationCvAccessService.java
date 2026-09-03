package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class ApplicationCvAccessService {
    private final ApplicationRepository applications;
    private final ObjectStorage storage;

    public ApplicationCvAccessService(ApplicationRepository applications, ObjectStorage storage) {
        this.applications = applications;
        this.storage = storage;
    }

    @Transactional(readOnly = true)
    public ApplicationCvDownload download(UUID recruiterUserId, UUID applicationId) {
        var snapshot = applications.findCvSnapshotForRecruiter(recruiterUserId, applicationId)
                .orElseThrow(ApplicationNotFoundException::new);
        return new ApplicationCvDownload(snapshot.cvVersionId(), snapshot.originalFilename(), snapshot.sizeBytes(),
                storage.openDownload(snapshot.objectBucket(), snapshot.objectKey()));
    }
}
