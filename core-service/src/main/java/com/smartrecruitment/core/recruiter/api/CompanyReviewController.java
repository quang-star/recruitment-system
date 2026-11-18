package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.api.dto.CompanyResponse;
import com.smartrecruitment.core.recruiter.application.CompanyReviewSearch;
import com.smartrecruitment.core.recruiter.application.CompanyReviewService;
import com.smartrecruitment.core.recruiter.domain.CompanyReviewChange;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.shared.api.CorrelationIdFilter;
import com.smartrecruitment.core.shared.api.SubjectId;
import com.smartrecruitment.core.shared.application.PageResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v2/dashboard/companies")
public class CompanyReviewController {
    private final CompanyReviewService companies;

    public CompanyReviewController(CompanyReviewService companies) { this.companies = companies; }

    @GetMapping
    public PageResult<CompanyResponse> search(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "") String q, @RequestParam(required = false) CompanyStatus status) {
        requireAdmin(jwt);
        return companies.search(new CompanyReviewSearch(page, size, q, status)).map(CompanyResponse::from);
    }

    @PostMapping("/{companyId}/approve")
    public CompanyResponse approve(@AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId,
            @Valid @RequestBody Approval request, HttpServletRequest servletRequest) {
        return CompanyResponse.from(companies.approve(requireAdmin(jwt), companyId, request.version(), request.reason(),
                UUID.fromString(CorrelationIdFilter.current(servletRequest))));
    }

    @PostMapping("/{companyId}/reject")
    public CompanyResponse reject(@AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId,
            @Valid @RequestBody Approval request, HttpServletRequest servletRequest) {
        return CompanyResponse.from(companies.reject(requireAdmin(jwt), companyId, request.version(), request.reason(),
                UUID.fromString(CorrelationIdFilter.current(servletRequest))));
    }

    @PostMapping("/{companyId}/suspend")
    public CompanyResponse suspend(@AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId,
            @Valid @RequestBody Approval request, HttpServletRequest servletRequest) {
        return CompanyResponse.from(companies.suspend(requireAdmin(jwt), companyId, request.version(), request.reason(),
                UUID.fromString(CorrelationIdFilter.current(servletRequest))));
    }

    @PostMapping("/{companyId}/reactivate")
    public CompanyResponse reactivate(@AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId,
            @Valid @RequestBody Approval request, HttpServletRequest servletRequest) {
        return CompanyResponse.from(companies.reactivate(requireAdmin(jwt), companyId, request.version(), request.reason(),
                UUID.fromString(CorrelationIdFilter.current(servletRequest))));
    }

    @GetMapping("/{companyId}/history")
    public List<CompanyReviewChange> history(@AuthenticationPrincipal Jwt jwt, @PathVariable Long companyId) {
        requireAdmin(jwt);
        return companies.history(companyId);
    }

    public record Approval(@NotNull @Min(0) Long version, @NotBlank @Size(max = 1000) String reason) { }

    private Long requireAdmin(Jwt jwt) {
        List<String> roles = jwt == null ? null : jwt.getClaimAsStringList("roles");
        if (roles == null || !roles.contains("SYSTEM_ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
        return SubjectId.parse(jwt.getSubject());
    }
}
