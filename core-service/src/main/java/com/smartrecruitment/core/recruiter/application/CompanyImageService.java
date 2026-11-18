package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.shared.application.port.ObjectStorage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

@Service
public class CompanyImageService {
    private final CompanyRepository companies;
    private final ObjectStorage storage;
    private final String bucket;

    public CompanyImageService(CompanyRepository companies, ObjectStorage storage,
                               @Value("${core.storage.bucket:smart-recruitment-cv}") String bucket) {
        this.companies = companies;
        this.storage = storage;
        this.bucket = bucket;
    }

    @Transactional
    public Company upload(Long userId, Long companyId, String kind, long version, MultipartFile file) {
        validateKind(kind);
        if (!companies.canManage(companyId, userId)) throw new CompanyNotFoundException();
        Company current = companies.findByIdForMember(companyId, userId).orElseThrow(CompanyNotFoundException::new);
        if (current.version() != version) throw new CompanyConflictException();
        if (file == null || file.isEmpty() || file.getSize() > 2 * 1024 * 1024) {
            throw new IllegalArgumentException("Ảnh phải có dung lượng không quá 2 MB.");
        }
        byte[] png = normalize(file);
        UUID id = UUID.randomUUID();
        String key = key(companyId, kind, id);
        String url = url(companyId, kind, id);
        storage.put(key, new ByteArrayInputStream(png), png.length, "image/png");
        try {
            Company updated = current.update(current.legalName(), current.displayName(), current.slug(),
                    current.description(), current.websiteUrl(), current.countryCode(), current.registrationNumber(),
                    current.sizeRange(), kind.equals("logo") ? url : current.logoUrl(),
                    kind.equals("cover") ? url : current.coverImageUrl());
            Company saved = companies.update(updated, version).orElseThrow(CompanyConflictException::new);
            String previous = kind.equals("logo") ? current.logoUrl() : current.coverImageUrl();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) { safeDelete(key); return; }
                    String prefix = prefix(companyId, kind);
                    if (previous != null && previous.startsWith(prefix)) {
                        try { safeDelete(key(companyId, kind, UUID.fromString(previous.substring(prefix.length())))); }
                        catch (IllegalArgumentException ignored) { }
                    }
                }
            });
            return saved;
        } catch (RuntimeException failure) {
            safeDelete(key);
            throw failure;
        }
    }

    @Transactional(readOnly = true)
    public InputStream download(Long companyId, String kind, UUID id) {
        validateKind(kind);
        Company company = companies.findById(companyId).orElseThrow(CompanyNotFoundException::new);
        String current = kind.equals("logo") ? company.logoUrl() : company.coverImageUrl();
        if (!url(companyId, kind, id).equals(current)) throw new CompanyNotFoundException();
        return storage.openDownload(bucket, key(companyId, kind, id));
    }

    private static void validateKind(String kind) {
        if (!"logo".equals(kind) && !"cover".equals(kind)) throw new CompanyNotFoundException();
    }

    private static String prefix(Long companyId, String kind) {
        return "/api/v2/public/companies/" + companyId + "/images/" + kind + "/";
    }

    private static String url(Long companyId, String kind, UUID id) { return prefix(companyId, kind) + id; }
    private static String key(Long companyId, String kind, UUID id) {
        return "company-images/" + companyId + "/" + kind + "/" + id + ".png";
    }

    private void safeDelete(String key) {
        try { storage.delete(key); } catch (RuntimeException ignored) { }
    }

    private static byte[] normalize(MultipartFile file) {
        try (ImageInputStream input = ImageIO.createImageInputStream(file.getInputStream())) {
            if (input == null) throw new IllegalArgumentException("Ảnh không hợp lệ.");
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IllegalArgumentException("Chỉ hỗ trợ ảnh JPEG hoặc PNG.");
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName();
                if (!format.equalsIgnoreCase("png") && !format.equalsIgnoreCase("jpeg")) {
                    throw new IllegalArgumentException("Chỉ hỗ trợ ảnh JPEG hoặc PNG.");
                }
                reader.setInput(input, true, true);
                if (reader.getWidth(0) > 4096 || reader.getHeight(0) > 4096) {
                    throw new IllegalArgumentException("Kích thước ảnh tối đa là 4096 × 4096 pixel.");
                }
                var image = reader.read(0);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                if (image == null || !ImageIO.write(image, "png", output)) throw new IllegalArgumentException("Ảnh không hợp lệ.");
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (IOException failure) {
            throw new IllegalArgumentException("Không thể đọc ảnh.", failure);
        }
    }
}
