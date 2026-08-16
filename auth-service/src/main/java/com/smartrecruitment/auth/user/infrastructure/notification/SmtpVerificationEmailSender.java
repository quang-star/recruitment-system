package com.smartrecruitment.auth.user.infrastructure.notification;

import com.smartrecruitment.auth.user.application.VerificationEmailDeliveryException;
import com.smartrecruitment.auth.user.application.port.VerificationEmailSender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;

@Component
public class SmtpVerificationEmailSender implements VerificationEmailSender {
    private final JavaMailSender mailSender;
    private final String from;
    private final String verificationBaseUrl;

    public SmtpVerificationEmailSender(
            JavaMailSender mailSender,
            @Value("${auth.email.from:no-reply@smart-recruitment.local}") String from,
            @Value("${auth.email.verification-base-url:http://localhost:5173/verify-email}") String verificationBaseUrl) {
        this.mailSender = mailSender;
        this.from = from;
        this.verificationBaseUrl = verificationBaseUrl;
    }

    @Override
    public void send(String recipient, String rawToken, Instant expiresAt) {
        String verificationUrl = UriComponentsBuilder.fromUriString(verificationBaseUrl)
                .queryParam("token", rawToken)
                .build()
                .toUriString();

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(recipient);
        message.setSubject("Verify your Smart Recruitment account");
        message.setText("""
                Welcome to Smart Recruitment.

                Verify your email by opening this link:
                %s

                This link expires at %s.
                If you did not create this account, ignore this email.
                """.formatted(verificationUrl, expiresAt));

        try {
            mailSender.send(message);
        } catch (MailException exception) {
            throw new VerificationEmailDeliveryException(exception);
        }
    }
}
