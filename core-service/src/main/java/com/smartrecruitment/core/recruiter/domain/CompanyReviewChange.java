package com.smartrecruitment.core.recruiter.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CompanyReviewChange(Long id, Long companyId, Long actorUserId, String action,
                                  CompanyStatus fromStatus, CompanyStatus toStatus, long version,
                                  String reason, UUID correlationId, OffsetDateTime occurredAt) { }
