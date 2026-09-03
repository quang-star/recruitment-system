package com.smartrecruitment.core.recruiter.infrastructure.email;

import com.smartrecruitment.core.recruiter.application.CompanyInvitationDeliveryException;
import com.smartrecruitment.core.recruiter.application.port.CompanyInvitationSender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.OffsetDateTime;

@Component
public class SmtpCompanyInvitationSender implements CompanyInvitationSender {
    private final JavaMailSender mailSender;
    private final String from;
    private final String acceptanceBaseUrl;

    public SmtpCompanyInvitationSender(JavaMailSender mailSender,
                                       @Value("${core.email.from:no-reply@smart-recruitment.local}") String from,
                                       @Value("${core.email.company-invitation-base-url:http://localhost:5173/accept-invitation}")
                                       String acceptanceBaseUrl) {
        this.mailSender = mailSender;
        this.from = from;
        this.acceptanceBaseUrl = acceptanceBaseUrl;
    }

    @Override
    public void send(String email, String companyName, String role, String rawToken, OffsetDateTime expiresAt) {
        String link = UriComponentsBuilder.fromUriString(acceptanceBaseUrl)
                .queryParam("token", rawToken).build().toUriString();
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Invitation to join " + companyName);
        message.setText("You were invited to join " + companyName + " as " + role + ".\n\n"
                + "Accept the invitation by opening this link:\n" + link + "\n\n"
                + "This invitation expires at " + expiresAt + ".\n"
                + "If you were not expecting this invitation, ignore this email.\n");
        try {
            mailSender.send(message);
        } catch (MailException exception) {
            throw new CompanyInvitationDeliveryException(exception);
        }
    }
}

