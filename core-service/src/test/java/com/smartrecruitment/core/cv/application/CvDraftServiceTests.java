package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.application.port.CvDraftRepository;
import com.smartrecruitment.core.cv.domain.CvDraft;
import com.smartrecruitment.core.cv.domain.CvDraftEntry;
import com.smartrecruitment.core.cv.domain.CvDraftPayload;
import com.smartrecruitment.core.cv.domain.CvDraftSection;
import com.smartrecruitment.core.cv.domain.CvDraftTemplate;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CvDraftServiceTests {
    private static final Clock FIXED_CLOCK = Clock.fixed(Instant.parse("2026-11-14T02:00:00Z"), ZoneOffset.UTC);

    @Test
    void createsUpdatesAndDeletesOwnedDraftWithOptimisticLocking() {
        var repo = new InMemoryCvDrafts();
        var service = new CvDraftService(repo, FIXED_CLOCK);

        var created = service.create(100L, "  CV Java Backend  ", CvDraftTemplate.MODERN, "#0F766E",
                CvDraftSection.defaultOrder(), samplePayload());
        assertThat(created.title()).isEqualTo("CV Java Backend");
        assertThat(created.accentColor()).isEqualTo("#0f766e");
        assertThat(created.version()).isZero();

        var updated = service.update(100L, created.id(), 0L, "CV Java Updated", CvDraftTemplate.MINIMAL,
                "#1e3a8a", CvDraftSection.defaultOrder(), samplePayload());
        assertThat(updated.version()).isEqualTo(1L);
        assertThat(updated.templateId()).isEqualTo(CvDraftTemplate.MINIMAL);

        assertThatThrownBy(() -> service.update(100L, created.id(), 0L, "Stale", CvDraftTemplate.CLASSIC,
                "#0f766e", CvDraftSection.defaultOrder(), samplePayload()))
                .isInstanceOf(CvDraftConflictException.class);

        assertThatThrownBy(() -> service.getMine(200L, created.id()))
                .isInstanceOf(CvDraftNotFoundException.class);

        assertThatThrownBy(() -> service.delete(100L, created.id(), 0L))
                .isInstanceOf(CvDraftConflictException.class);

        service.delete(100L, created.id(), 1L);
        assertThat(service.listMine(100L)).isEmpty();
    }

    @Test
    void enforcesDomainValidationAndMaxDraftCap() {
        var repo = new InMemoryCvDrafts();
        var service = new CvDraftService(repo, FIXED_CLOCK);

        assertThatThrownBy(() -> service.create(100L, " ", CvDraftTemplate.CLASSIC, "#0f766e",
                CvDraftSection.defaultOrder(), samplePayload()))
                .isInstanceOf(CvDraftValidationException.class);

        assertThatThrownBy(() -> service.create(100L, "CV", CvDraftTemplate.CLASSIC, "teal",
                CvDraftSection.defaultOrder(), samplePayload()))
                .isInstanceOf(CvDraftValidationException.class);

        assertThatThrownBy(() -> service.create(100L, "CV", CvDraftTemplate.CLASSIC, "#0f766e",
                List.of(CvDraftSection.INTRODUCTION, CvDraftSection.INTRODUCTION), samplePayload()))
                .isInstanceOf(CvDraftValidationException.class);

        for (int i = 0; i < CvDraft.MAX_DRAFTS_PER_CANDIDATE; i++) {
            service.create(100L, "Draft " + i, CvDraftTemplate.CLASSIC, "#0f766e",
                    CvDraftSection.defaultOrder(), samplePayload());
        }
        assertThatThrownBy(() -> service.create(100L, "Draft overflow", CvDraftTemplate.CLASSIC, "#0f766e",
                CvDraftSection.defaultOrder(), samplePayload()))
                .isInstanceOf(CvDraftValidationException.class)
                .hasMessageContaining("50");
    }

    @Test
    void validatesExecutiveTemplateAndStylingOptionsAndRejectsUnsafePhotoUrls() {
        var repo = new InMemoryCvDrafts();
        var service = new CvDraftService(repo, FIXED_CLOCK);

        var styledPayload = new CvDraftPayload(
                "Nguyễn Minh An", "Backend Developer", "an@example.invalid", "0901234567", "TP. HCM", "",
                "Giới thiệu ngắn", "Java, Spring Boot",
                List.of(), List.of(), List.of(), List.of(), List.of(),
                "data:image/png;base64,iVBORw0KGgo=", "en", "small", "relaxed",
                List.of(CvDraftSection.CERTIFICATES)
        );
        var created = service.create(101L, "Executive CV", CvDraftTemplate.EXECUTIVE, "#0f766e",
                CvDraftSection.defaultOrder(), styledPayload);
        assertThat(created.templateId()).isEqualTo(CvDraftTemplate.EXECUTIVE);
        assertThat(created.payload().language()).isEqualTo("en");
        assertThat(created.payload().hiddenSections()).containsExactly(CvDraftSection.CERTIFICATES);

        assertThatThrownBy(() -> new CvDraftPayload(
                "A", "", "", "", "", "", "", "",
                List.of(), List.of(), List.of(), List.of(), List.of(),
                "data:image/svg+xml;base64,PHN2Zz4=", "vi", "medium", "normal", List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("photoDataUrl");

        assertThatThrownBy(() -> new CvDraftPayload(
                "A", "", "", "", "", "", "", "",
                List.of(), List.of(), List.of(), List.of(), List.of(),
                "", "fr", "medium", "normal", List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("language");

        var fullPayload = new CvDraftPayload(
                "Nguyễn Minh An", "Backend Developer", "an@example.invalid", "0901234567", "TP. HCM", "",
                "Giới thiệu ngắn", "Java, Spring Boot",
                List.of(), List.of(), List.of(), List.of(), List.of(),
                "", "vi", "medium", "normal", List.of(),
                "serif", "1999-05-12", "Nam",
                List.of(new CvDraftEntry("award-1", "Giải Nhất Hackathon", "FPT", "2024-06", "", false, "Nhóm 4 người")),
                List.of(new CvDraftEntry("act-1", "CLB IT", "Thành viên", "2022-01", "", true, "")),
                List.of(new CvDraftEntry("hob-1", "Đọc sách công nghệ", "", "", "", false, "")),
                Map.of("awards", "Danh hiệu & Giải thưởng")
        );
        var legacyOrder = List.of(
                CvDraftSection.INTRODUCTION, CvDraftSection.SKILLS, CvDraftSection.EXPERIENCES,
                CvDraftSection.EDUCATION, CvDraftSection.PROJECTS, CvDraftSection.CERTIFICATES,
                CvDraftSection.LANGUAGES
        );
        var normalized = service.create(102L, "Full TopCV Draft", CvDraftTemplate.EXECUTIVE, "#00b14f",
                legacyOrder, fullPayload);
        assertThat(normalized.sectionOrder()).containsExactly(CvDraftSection.values());
        assertThat(normalized.payload().fontFamily()).isEqualTo("serif");
        assertThat(normalized.payload().awards()).hasSize(1);
        assertThat(normalized.payload().sectionTitles()).containsEntry("awards", "Danh hiệu & Giải thưởng");
    }

    private static CvDraftPayload samplePayload() {
        return new CvDraftPayload(
                "Nguyễn Minh An",
                "Backend Developer",
                "an@example.invalid",
                "0901234567",
                "TP. HCM",
                "",
                "Giới thiệu ngắn",
                "Java, Spring Boot",
                List.of(new CvDraftEntry("entry-1", "Backend Dev", "Công ty A", "2023-01", "", true, "API")),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        );
    }

    private static final class InMemoryCvDrafts implements CvDraftRepository {
        private final AtomicLong seq = new AtomicLong(1000L);
        private final Map<Long, CvDraft> store = new HashMap<>();

        @Override
        public long countOwned(Long candidateUserId) {
            return store.values().stream().filter(d -> d.candidateUserId().equals(candidateUserId)).count();
        }

        @Override
        public List<CvDraft> findAllOwned(Long candidateUserId) {
            return store.values().stream().filter(d -> d.candidateUserId().equals(candidateUserId)).toList();
        }

        @Override
        public Optional<CvDraft> findOwned(Long candidateUserId, Long draftId) {
            return Optional.ofNullable(store.get(draftId)).filter(d -> d.candidateUserId().equals(candidateUserId));
        }

        @Override
        public CvDraft insert(CvDraft draft) {
            long id = seq.incrementAndGet();
            var saved = new CvDraft(id, draft.candidateUserId(), draft.title(), draft.templateId(),
                    draft.accentColor(), draft.sectionOrder(), draft.payload(),
                    draft.createdAt(), draft.updatedAt(), 0L);
            store.put(id, saved);
            return saved;
        }

        @Override
        public Optional<CvDraft> update(CvDraft draft, long expectedVersion) {
            var current = store.get(draft.id());
            if (current == null || !current.candidateUserId().equals(draft.candidateUserId())
                    || current.version() != expectedVersion) {
                return Optional.empty();
            }
            var next = new CvDraft(draft.id(), draft.candidateUserId(), draft.title(), draft.templateId(),
                    draft.accentColor(), draft.sectionOrder(), draft.payload(),
                    current.createdAt(), draft.updatedAt(), current.version() + 1L);
            store.put(draft.id(), next);
            return Optional.of(next);
        }

        @Override
        public boolean deleteOwned(Long candidateUserId, Long draftId, long expectedVersion) {
            var current = store.get(draftId);
            if (current == null || !current.candidateUserId().equals(candidateUserId)
                    || current.version() != expectedVersion) {
                return false;
            }
            store.remove(draftId);
            return true;
        }
    }
}
