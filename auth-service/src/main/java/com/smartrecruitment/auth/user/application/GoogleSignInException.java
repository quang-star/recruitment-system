package com.smartrecruitment.auth.user.application;

public class GoogleSignInException extends RuntimeException {
    public enum Reason { INVALID_TOKEN, NOT_CONFIGURED, LINK_REQUIRED, ACCOUNT_CONFLICT }

    private final Reason reason;

    public GoogleSignInException(Reason reason) {
        super(switch (reason) {
            case INVALID_TOKEN -> "Không xác minh được đăng nhập Google. Vui lòng thử lại.";
            case NOT_CONFIGURED -> "Đăng nhập Google chưa được cấu hình.";
            case LINK_REQUIRED -> "Hãy đăng nhập tài khoản hiện có, sau đó liên kết Google trong mục bảo mật.";
            case ACCOUNT_CONFLICT -> "Không thể liên kết tài khoản Google này. Vui lòng kiểm tra tài khoản hoặc thử lại.";
        });
        this.reason = reason;
    }

    public Reason reason() { return reason; }
}
