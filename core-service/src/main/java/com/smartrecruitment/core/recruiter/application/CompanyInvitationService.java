package com.smartrecruitment.core.recruiter.application;

import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationRepository;
import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationSender;
import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationTokenGenerator;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.CompanyInvitation;
import com.smartrecruitment.core.recruiter.domain.CompanyMember;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import com.smartrecruitment.core.notification.application.NotificationService;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class CompanyInvitationService {
    private static final Duration INVITATION_TTL = Duration.ofDays(7);
    private static final Set<String> INVITABLE_ROLES = Set.of("COMPANY_ADMIN", "RECRUITER", "VIEWER");

    private final CompanyRepository companies;
    private final CompanyInvitationRepository invitations;
    private final CompanyInvitationTokenGenerator tokens;
    private final CompanyInvitationSender sender;
    private final Clock clock;
    private final NotificationService notifications;

    public CompanyInvitationService(CompanyRepository companies, CompanyInvitationRepository invitations,
                                    CompanyInvitationTokenGenerator tokens, CompanyInvitationSender sender,
                                    Clock clock) {
        this(companies, invitations, tokens, sender, clock, null);
    }

    @Autowired
    public CompanyInvitationService(CompanyRepository companies, CompanyInvitationRepository invitations,
                                    CompanyInvitationTokenGenerator tokens, CompanyInvitationSender sender,
                                    Clock clock, NotificationService notifications) {
        this.companies = companies;
        this.invitations = invitations;
        this.tokens = tokens;
        this.sender = sender;
        this.clock = clock;
        this.notifications = notifications;
    }

    @Transactional
    public CompanyInvitation invite(UUID actorUserId, UUID companyId, String email, String role) {
        requireManager(actorUserId, companyId);
        String normalizedEmail = normalizeEmail(email);
        String normalizedRole = normalizeRole(role);
        OffsetDateTime now = OffsetDateTime.now(clock);
        invitations.revokeExpired(companyId, normalizedEmail, now);
        if (invitations.findActive(companyId, normalizedEmail, now).isPresent()) {
            throw new CompanyInvitationConflictException("An active invitation already exists for this email");
        }
        String rawToken = tokens.generate();
        CompanyInvitation invitation = invitations.insert(CompanyInvitation.create(companyId, email.trim(),
                normalizedEmail, normalizedRole, tokens.hash(rawToken), actorUserId,
                now, now.plus(INVITATION_TTL)));
        String companyName = companies.findByPublicIdForMember(companyId, actorUserId)
                .orElseThrow(CompanyNotFoundException::new).displayName();
        sender.send(invitation.email(), companyName, invitation.role(), rawToken, invitation.expiresAt());
        return invitation;
    }

    @Transactional(readOnly = true)
    public List<CompanyInvitation> list(UUID actorUserId, UUID companyId) {
        requireManager(actorUserId, companyId);
        return invitations.findAll(companyId);
    }

    @Transactional
    public void revoke(UUID actorUserId, UUID companyId, UUID invitationId, long expectedVersion) {
        requireManager(actorUserId, companyId);
        if (!invitations.revoke(companyId, invitationId, expectedVersion, OffsetDateTime.now(clock))) {
            throw new CompanyInvitationNotFoundException();
        }
    }

    @Transactional
    public CompanyMember accept(UUID userId, String jwtEmail, String rawToken) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        CompanyInvitation invitation = invitations.findActiveByTokenHash(tokens.hash(rawToken), now)
                .orElseThrow(CompanyInvitationNotFoundException::new);
        if (!invitation.normalizedEmail().equals(normalizeEmail(jwtEmail))) {
            throw new CompanyInvitationConflictException("Invitation belongs to a different email address");
        }
        companies.findMember(invitation.companyId(), userId).ifPresent(member -> {
            if (!"LEFT".equals(member.status())) {
                throw new CompanyInvitationConflictException("User is already a member of this company");
            }
        });
        CompanyMember member = invitations.accept(invitation, userId, now)
                .orElseThrow(() -> new CompanyInvitationConflictException("Invitation changed; reload and try again"));
        if (notifications != null) {
            notifications.invitationAccepted(invitation.invitedByUserId(), invitation.publicId(), invitation.email());
        }
        return member;
    }

    private void requireManager(UUID actorUserId, UUID companyId) {
        if (!companies.canManage(companyId, actorUserId)) throw new CompanyNotFoundException();
    }

    private static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) throw new IllegalArgumentException("Email is required");
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeRole(String role) {
        String normalized = role == null ? "" : role.trim().toUpperCase(Locale.ROOT);
        if (!INVITABLE_ROLES.contains(normalized)) throw new IllegalArgumentException("Invalid invitation role");
        return normalized;
    }
}
