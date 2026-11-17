package com.smartrecruitment.core.catalog.domain;


/** IDs select approved entries; names permit immediate use of a new proposal. */
public record CategoryChoice(Long industryId, String industryName,
                             Long specializationId, String specializationName,
                             Long positionId, String positionName) { }
