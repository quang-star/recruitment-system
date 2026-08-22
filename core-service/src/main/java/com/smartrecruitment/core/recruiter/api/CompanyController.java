package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.api.dto.CompanyResponse;
import com.smartrecruitment.core.recruiter.api.dto.CreateCompanyRequest;
import com.smartrecruitment.core.recruiter.application.CompanyService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/companies")
public class CompanyController {
    private final CompanyService companies;

    public CompanyController(CompanyService companies) {
        this.companies = companies;
    }

    @PostMapping
    public CompanyResponse create(@AuthenticationPrincipal Jwt jwt,
                                  @Valid @RequestBody CreateCompanyRequest request) {
        return CompanyResponse.from(companies.create(userId(jwt), request.legalName(), request.displayName(),
                request.slug(), request.description(), request.websiteUrl(), request.countryCode(),
                request.registrationNumber(), request.sizeRange()));
    }

    @GetMapping
    public List<CompanyResponse> findMine(@AuthenticationPrincipal Jwt jwt) {
        return companies.findMine(userId(jwt)).stream().map(CompanyResponse::from).toList();
    }

    @GetMapping("/{companyId}")
    public CompanyResponse getMine(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId) {
        return CompanyResponse.from(companies.getMine(userId(jwt), companyId));
    }

    @PutMapping("/{companyId}")
    public CompanyResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID companyId,
                                  @Valid @RequestBody CreateCompanyRequest request) {
        return CompanyResponse.from(companies.updateMine(userId(jwt), companyId, request.legalName(),
                request.displayName(), request.slug(), request.description(), request.websiteUrl(),
                request.countryCode(), request.registrationNumber(), request.sizeRange(), requestVersion(request)));
    }

    private Long requestVersion(CreateCompanyRequest request) {
        return request.version();
    }

    private UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
