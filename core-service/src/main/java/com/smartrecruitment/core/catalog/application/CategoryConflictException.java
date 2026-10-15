package com.smartrecruitment.core.catalog.application;

public class CategoryConflictException extends RuntimeException {
    public CategoryConflictException() { super("Danh mục đã thay đổi hoặc tên đã tồn tại. Vui lòng tải lại."); }
}
