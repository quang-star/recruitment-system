package com.smartrecruitment.core.catalog.domain;

import java.util.UUID;

/** IDs select approved entries; names permit immediate use of a new proposal. */
public record CategoryChoice(UUID industryId, String industryName,
                             UUID specializationId, String specializationName,
                             UUID positionId, String positionName) { }
