package com.smartrecruitment.core.shared.infrastructure;

import org.jooq.Condition;
import org.jooq.Field;
import org.jooq.impl.DSL;
import java.text.Normalizer;
import java.util.Locale;

public final class SearchText {
    private static final String ACCENTS = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";
    private SearchText() { }

    public static Condition contains(Field<String> field, String query) {
        return DSL.translate(DSL.lower(field), ACCENTS, normalize(ACCENTS)).contains(normalize(query));
    }

    private static String normalize(String text) {
        return Normalizer.normalize(text.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replace('đ', 'd');
    }
}
