package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;
import com.smartrecruitment.core.shared.application.port.ObjectStorage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CompanyImageServiceTest {
    private final CompanyRepository companies = mock(CompanyRepository.class);
    private final ObjectStorage storage = mock(ObjectStorage.class);
    private final CompanyImageService service = new CompanyImageService(companies, storage, "bucket");
    private final Company company = new Company(10L, "Legal", "Display", "display", null, null, "VN",
            null, null, null, null, CompanyStatus.PENDING, CompanyVerificationStatus.UNVERIFIED, 7L, 2);

    @AfterEach void cleanup() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.clearSynchronization();
    }

    @Test void requiresManagerAndCurrentVersionBeforeStorage() throws Exception {
        assertThatThrownBy(() -> service.upload(7L, 10L, "logo", 2, image())).isInstanceOf(CompanyNotFoundException.class);
        when(companies.canManage(10L, 7L)).thenReturn(true);
        when(companies.findByIdForMember(10L, 7L)).thenReturn(Optional.of(company));
        assertThatThrownBy(() -> service.upload(7L, 10L, "logo", 1, image())).isInstanceOf(CompanyConflictException.class);
        verifyNoInteractions(storage);
    }

    @Test void rejectsInvalidFileBytesAndOversize() {
        when(companies.canManage(10L, 7L)).thenReturn(true);
        when(companies.findByIdForMember(10L, 7L)).thenReturn(Optional.of(company));
        var invalid = new MockMultipartFile("file", "image.png", "image/png", new byte[]{1, 2, 3});
        var large = new MockMultipartFile("file", "image.png", "image/png", new byte[2 * 1024 * 1024 + 1]);
        assertThatThrownBy(() -> service.upload(7L, 10L, "logo", 2, invalid)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.upload(7L, 10L, "logo", 2, large)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(storage);
    }

    @Test void uploadsAndOnlyServesCurrentCompanyImage() throws Exception {
        when(companies.canManage(10L, 7L)).thenReturn(true);
        when(companies.findByIdForMember(10L, 7L)).thenReturn(Optional.of(company));
        when(companies.update(any(), eq(2L))).thenAnswer(call -> Optional.of(call.getArgument(0)));
        TransactionSynchronizationManager.initSynchronization();
        Company updated = service.upload(7L, 10L, "cover", 2, image());
        assertThat(updated.coverImageUrl()).startsWith("/api/v2/public/companies/10/images/cover/");
        assertThat(updated.logoUrl()).isNull();
        verify(storage).put(startsWith("company-images/10/cover/"), any(), anyLong(), eq("image/png"));
        UUID id = UUID.fromString(updated.coverImageUrl().substring(updated.coverImageUrl().lastIndexOf('/') + 1));
        when(companies.findById(10L)).thenReturn(Optional.of(updated));
        assertThatThrownBy(() -> service.download(10L, "cover", UUID.randomUUID())).isInstanceOf(CompanyNotFoundException.class);
        assertThatThrownBy(() -> service.download(10L, "logo", id)).isInstanceOf(CompanyNotFoundException.class);
        service.download(10L, "cover", id);
        verify(storage).openDownload("bucket", "company-images/10/cover/" + id + ".png");
    }

    @Test void removesObjectOnConflictOrRollback() throws Exception {
        when(companies.canManage(10L, 7L)).thenReturn(true);
        when(companies.findByIdForMember(10L, 7L)).thenReturn(Optional.of(company));
        when(companies.update(any(), eq(2L))).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.upload(7L, 10L, "logo", 2, image())).isInstanceOf(CompanyConflictException.class);
        verify(storage).delete(startsWith("company-images/10/logo/"));
        reset(storage);
        when(companies.update(any(), eq(2L))).thenAnswer(call -> Optional.of(call.getArgument(0)));
        TransactionSynchronizationManager.initSynchronization();
        service.upload(7L, 10L, "logo", 2, image());
        TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        verify(storage).delete(startsWith("company-images/10/logo/"));
    }

    private static MockMultipartFile image() throws Exception {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", bytes);
        return new MockMultipartFile("file", "image.png", "image/png", bytes.toByteArray());
    }
}
