package com.smartrecruitment.core.job.application;

import java.util.List;

public record JobDiscovery(List<String> locations, List<Category> categories) {
    public record Category(Long industryId, Long specializationId, String name, int jobCount) {}
}
