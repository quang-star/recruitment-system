package com.smartrecruitment.core.candidate.application;

import com.smartrecruitment.core.candidate.domain.CandidateProfile;
import com.smartrecruitment.core.candidate.domain.ProfileVisibility;
import com.smartrecruitment.core.shared.application.port.ObjectStorage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CandidateAvatarServiceTest {
    private final CandidateProfileService profiles = mock(CandidateProfileService.class);
    private final ObjectStorage storage = mock(ObjectStorage.class);
    private final CandidateAvatarService service = new CandidateAvatarService(profiles, storage, "bucket");
    private final CandidateProfile profile = new CandidateProfile(1L, 7L, "An", null, null,
            ProfileVisibility.PRIVATE, 2, null, null, null, null, null, null, null);

    @AfterEach void cleanup() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }

    @Test void rejectsInvalidFileBeforeStorage() {
        var file = new MockMultipartFile("file", "image.png", "image/png", new byte[]{1, 2, 3});
        assertThatThrownBy(() -> service.upload(7L, 2, file)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(storage);
    }

    @Test void uploadsAndRestrictsDownloadsToCurrentProfile() throws Exception {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", bytes);
        var file = new MockMultipartFile("file", "image.png", "image/png", bytes.toByteArray());
        when(profiles.getMine(7L)).thenReturn(profile);
        when(profiles.putMine(eq(7L), anyString(), isNull(), isNull(), eq(ProfileVisibility.PRIVATE), eq(2L),
                isNull(), isNull(), isNull(), isNull(), isNull(), anyString(), isNull())).thenAnswer(invocation ->
                profile.update(profile.displayName(), null, null, profile.visibility(), null, null, null, null, null,
                        invocation.getArgument(11), null));
        TransactionSynchronizationManager.initSynchronization();
        CandidateProfile result = service.upload(7L, 2, file);
        assertThat(result.avatarUrl()).startsWith("/api/v2/candidates/me/avatar/");
        verify(storage).put(startsWith("candidate-avatars/7/"), any(), anyLong(), eq("image/png"));
        UUID id = UUID.fromString(result.avatarUrl().substring(result.avatarUrl().lastIndexOf('/') + 1));
        assertThatThrownBy(() -> service.download(7L, id)).isInstanceOf(CandidateProfileNotFoundException.class);
        when(profiles.getMine(7L)).thenReturn(result);
        service.download(7L, id);
        verify(storage).openDownload(eq("bucket"), contains(id.toString()));
    }
}
