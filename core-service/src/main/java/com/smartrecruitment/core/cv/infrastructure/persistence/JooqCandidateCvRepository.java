package com.smartrecruitment.core.cv.infrastructure.persistence;

import com.smartrecruitment.core.cv.application.port.CandidateCvRepository;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;
import com.smartrecruitment.core.cv.domain.CvStatus;
import com.smartrecruitment.core.cv.domain.CvVersion;
import org.jooq.DSLContext;
import org.jooq.SelectOnConditionStep;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.CvVersionsRecord;
import com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.CvsRecord;

@Repository
public class JooqCandidateCvRepository implements CandidateCvRepository {
    private final DSLContext dsl;

    public JooqCandidateCvRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    @Override
    public CandidateCv insert(CandidateCv candidateCv) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        var cvRecord = dsl.insertInto(CVS)
                .set(CVS.PUBLIC_ID, candidateCv.publicId())
                .set(CVS.CANDIDATE_USER_ID, candidateCv.candidateUserId())
                .set(CVS.TITLE, candidateCv.title())
                .set(CVS.STATUS, candidateCv.status().name())
                .set(CVS.CREATED_AT, now)
                .set(CVS.UPDATED_AT, now)
                .set(CVS.VERSION, 0L)
                .returning()
                .fetchOne();
        if (cvRecord == null) throw new IllegalStateException("Insert CV returned no record");

        var version = candidateCv.activeVersion();
        var versionRecord = dsl.insertInto(CV_VERSIONS)
                .set(CV_VERSIONS.PUBLIC_ID, version.publicId())
                .set(CV_VERSIONS.CV_ID, cvRecord.getId())
                .set(CV_VERSIONS.VERSION_NUMBER, version.versionNumber())
                .set(CV_VERSIONS.OBJECT_BUCKET, version.objectBucket())
                .set(CV_VERSIONS.OBJECT_KEY, version.objectKey())
                .set(CV_VERSIONS.ORIGINAL_FILENAME, version.originalFilename())
                .set(CV_VERSIONS.MIME_TYPE, version.mimeType())
                .set(CV_VERSIONS.SIZE_BYTES, version.sizeBytes())
                .set(CV_VERSIONS.SHA256, version.sha256())
                .set(CV_VERSIONS.LANGUAGE_HINT, version.languageHint())
                .set(CV_VERSIONS.PROCESSING_STATUS, version.processingStatus().name())
                .set(CV_VERSIONS.CREATED_BY_USER_ID, candidateCv.candidateUserId())
                .set(CV_VERSIONS.CREATED_AT, now)
                .set(CV_VERSIONS.UPDATED_AT, now)
                .set(CV_VERSIONS.VERSION, 0L)
                .returning()
                .fetchOne();
        if (versionRecord == null) throw new IllegalStateException("Insert CV version returned no record");

        var updatedCvRecord = dsl.update(CVS)
                .set(CVS.ACTIVE_VERSION_ID, versionRecord.getId())
                .where(CVS.ID.eq(cvRecord.getId()))
                .returning()
                .fetchOne();
        if (updatedCvRecord == null) throw new IllegalStateException("Activate CV version returned no record");
        return toDomain(updatedCvRecord, versionRecord);
    }

    @Override
    public boolean updateProcessingStatus(UUID cvVersionId, String sourceHash,
                                          CvProcessingStatus status, String failureCode) {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        return dsl.update(CV_VERSIONS)
                .set(CV_VERSIONS.PROCESSING_STATUS, status.name())
                .set(CV_VERSIONS.FAILURE_CODE, failureCode)
                .set(CV_VERSIONS.CONFIRMED_AT,
                        status == CvProcessingStatus.CONFIRMED ? now : null)
                .set(CV_VERSIONS.UPDATED_AT, now)
                .set(CV_VERSIONS.VERSION, CV_VERSIONS.VERSION.add(1L))
                .where(CV_VERSIONS.PUBLIC_ID.eq(cvVersionId))
                .and(CV_VERSIONS.SHA256.eq(sourceHash))
                .execute() == 1;
    }

    @Override
    public List<CandidateCv> findByCandidateUserId(UUID candidateUserId) {
        return baseSelect()
                .where(CVS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(CVS.STATUS.ne(CvStatus.DELETED.name()))
                .orderBy(CVS.UPDATED_AT.desc())
                .fetch(this::toDomain);
    }

    @Override
    public Optional<CandidateCv> findByPublicId(UUID candidateUserId, UUID cvId) {
        return baseSelect()
                .where(CVS.CANDIDATE_USER_ID.eq(candidateUserId))
                .and(CVS.PUBLIC_ID.eq(cvId))
                .and(CVS.STATUS.ne(CvStatus.DELETED.name()))
                .fetchOptional(this::toDomain);
    }

    private SelectOnConditionStep<org.jooq.Record> baseSelect() {
        return dsl.select(CVS.fields()).select(CV_VERSIONS.fields())
                .from(CVS)
                .join(CV_VERSIONS)
                .on(CV_VERSIONS.CV_ID.eq(CVS.ID))
                .and(CV_VERSIONS.ID.eq(CVS.ACTIVE_VERSION_ID));
    }

    private CandidateCv toDomain(org.jooq.Record record) {
        return toDomain(record.into(CVS), record.into(CV_VERSIONS));
    }

    private CandidateCv toDomain(CvsRecord cvRecord, CvVersionsRecord versionRecord) {
        return new CandidateCv(
                cvRecord.getPublicId(),
                cvRecord.getCandidateUserId(),
                cvRecord.getTitle(),
                CvStatus.valueOf(cvRecord.getStatus()),
                new CvVersion(
                        versionRecord.getPublicId(),
                        versionRecord.getVersionNumber(),
                        versionRecord.getObjectBucket(),
                        versionRecord.getObjectKey(),
                        versionRecord.getOriginalFilename(),
                        versionRecord.getMimeType(),
                        versionRecord.getSizeBytes(),
                        versionRecord.getSha256().trim(),
                        versionRecord.getLanguageHint(),
                        CvProcessingStatus.valueOf(versionRecord.getProcessingStatus()),
                        versionRecord.getFailureCode(),
                        versionRecord.getVersion()),
                cvRecord.getVersion());
    }
}
