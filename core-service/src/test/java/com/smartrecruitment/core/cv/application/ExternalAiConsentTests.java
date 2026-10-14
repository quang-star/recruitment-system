package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.application.port.CandidateCvRepository;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.shared.domain.ExternalAiConsent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ExternalAiConsentTests {
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"external-ai/old", "unknown"})
    void acceptingMissingOrOutdatedNoticeIsRejected(String policy) {
        assertThatThrownBy(() -> ExternalAiConsent.fromChoice(true, policy))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void uploadPersistsExplicitChoiceAndOutboxUsesTheSameChoice() {
        var repository = mock(CandidateCvRepository.class);
        when(repository.insert(any())).thenAnswer(call -> call.getArgument(0));
        var outbox = mock(OutboxEventRepository.class);
        var service = new CvService(repository, mock(ObjectStorage.class), outbox, "private");
        var consent = ExternalAiConsent.fromChoice(true, ExternalAiConsent.POLICY_VERSION);
        var created = service.upload(UUID.randomUUID(), "Synthetic CV", pdf(), UUID.randomUUID(), consent);
        assertThat(created.activeVersion().externalAiConsent()).isEqualTo(consent);
        verify(repository).insert(argThat(cv -> cv.activeVersion().externalAiConsent().equals(consent)));
        verify(outbox).append(argThat((CvUploadedEvent event) -> event.externalAiConsent().equals(consent)));
    }

    @Test
    void legacyUploadDoesNotGrantExternalAi() {
        var repository = mock(CandidateCvRepository.class);
        when(repository.insert(any())).thenAnswer(call -> call.getArgument(0));
        CandidateCv created = new CvService(repository, mock(ObjectStorage.class))
                .upload(UUID.randomUUID(), "Synthetic CV", pdf());
        assertThat(created.activeVersion().externalAiConsent().granted()).isFalse();
        assertThat(created.activeVersion().externalAiConsent().policyVersion()).isNull();
    }

    private static MockMultipartFile pdf() {
        return new MockMultipartFile("file", "synthetic.pdf", "application/pdf", "%PDF-1.7\nbody".getBytes());
    }
}
