package com.smartrecruitment.core.shared.application;

import java.util.List;
import java.util.function.Function;

public record PageResult<T>(List<T> items, long total, int page, int size) {
    public PageResult { items = List.copyOf(items); }

    public <R> PageResult<R> map(Function<T, R> mapper) {
        return new PageResult<>(items.stream().map(mapper).toList(), total, page, size);
    }
}
