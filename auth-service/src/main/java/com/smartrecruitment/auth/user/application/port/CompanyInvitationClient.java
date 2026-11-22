package com.smartrecruitment.auth.user.application.port;

public interface CompanyInvitationClient {
    Membership accept(String accessToken, String token);

    record Membership(Long companyId, Long userId, String role, String status) {}
}
