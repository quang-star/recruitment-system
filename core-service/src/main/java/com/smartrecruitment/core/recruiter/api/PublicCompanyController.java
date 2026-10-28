package com.smartrecruitment.core.recruiter.api;

import com.smartrecruitment.core.recruiter.api.dto.CompanyResponse;
import com.smartrecruitment.core.recruiter.application.CompanyService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class PublicCompanyController {
    private final CompanyService companies;

    public PublicCompanyController(CompanyService companies) {
        this.companies = companies;
    }

    @GetMapping({"/api/v2/public/companies", "/api/v2/candidate/companies"})
    public List<CompanyResponse> findPublic() {
        return companies.findPublic().stream().map(CompanyResponse::from).toList();
    }

    @GetMapping({"/api/v2/public/companies/{companyId}", "/api/v2/candidate/companies/{companyId}"})
    public CompanyResponse getPublic(@PathVariable Long companyId) {
        return CompanyResponse.from(companies.getPublic(companyId));
    }
}
