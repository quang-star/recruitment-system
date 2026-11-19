import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "dompurify";

type RichTextEditorProps = {
  id?: string;
  label: string;
  value: string;
  placeholder?: string;
  minHeightClass?: string;
  disabled?: boolean;
  onChange: (html: string) => void;
};

/**
 * Constrained WYSIWYG editor for job descriptions, requirements, and benefits.
 * Restricts formatting to semantic structure (headings, bold, italic, lists)
 * so all job postings maintain a consistent visual style.
 */
export function RichTextEditor({
  id,
  label,
  value,
  placeholder,
  minHeightClass = "min-h-[130px]",
  disabled = false,
  onChange,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
    ],
    editable: !disabled,
    content: value || "",
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        "aria-label": label,
        "data-placeholder": placeholder ?? "",
        class: `prose prose-sm max-w-none px-3.5 py-2.5 text-sm text-ink-900 focus:outline-none ${minHeightClass} [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-1`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== !disabled) {
      editor.setEditable(!disabled, false);
    }
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return null;
  }

  const btnClass = (active: boolean) =>
    `inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
      active
        ? "bg-brand-100 text-brand-700 font-semibold"
        : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
    }`;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-border-subtle ${
        disabled ? "bg-slate-50 text-ink-500" : "bg-white focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/20"
      }`}
    >
      <div
        role="toolbar"
        aria-label={`Định dạng ${label}`}
        className="flex flex-wrap items-center gap-1 border-b border-border-subtle bg-slate-50/80 px-2.5 py-1.5"
      >
        <button
          type="button"
          title="Tiêu đề nhỏ (H3)"
          aria-label="Tiêu đề nhỏ"
          disabled={disabled}
          aria-pressed={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`${btnClass(editor.isActive("heading", { level: 3 }))} disabled:opacity-40`}
        >
          H3
        </button>
        <button
          type="button"
          title="In đậm"
          aria-label="In đậm"
          disabled={disabled}
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${btnClass(editor.isActive("bold"))} disabled:opacity-40`}
        >
          <span className="font-bold">B</span>
        </button>
        <button
          type="button"
          title="In nghiêng"
          aria-label="In nghiêng"
          disabled={disabled}
          aria-pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${btnClass(editor.isActive("italic"))} disabled:opacity-40`}
        >
          <span className="italic font-serif">I</span>
        </button>
        <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />
        <button
          type="button"
          title="Danh sách gạch đầu dòng"
          aria-label="Danh sách gạch đầu dòng"
          disabled={disabled}
          aria-pressed={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${btnClass(editor.isActive("bulletList"))} disabled:opacity-40`}
        >
          •≡
        </button>
        <button
          type="button"
          title="Danh sách đánh số"
          aria-label="Danh sách đánh số"
          disabled={disabled}
          aria-pressed={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${btnClass(editor.isActive("orderedList"))} disabled:opacity-40`}
        >
          1.
        </button>
        <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden="true" />
        <button
          type="button"
          title="Hoàn tác"
          aria-label="Hoàn tác"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
          className={`${btnClass(false)} disabled:opacity-40`}
        >
          ↺
        </button>
        <button
          type="button"
          title="Làm lại"
          aria-label="Làm lại"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          className={`${btnClass(false)} disabled:opacity-40`}
        >
          ↻
        </button>
      </div>
      <div className="relative">
        {editor.isEmpty && placeholder && (
          <span className="pointer-events-none absolute left-3.5 top-3.5 text-sm font-normal text-ink-400">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/** Converts rich HTML (or plain text) into clean plain text for compact card previews and validation. */
export function richTextToPlainText(content: string): string {
  if (!content) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(content)) return content;
  const withBreaks = content
    .replace(/<\/(?:p|div|li|h[1-6]|ul|ol)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "");
  if (typeof document !== "undefined") {
    const decoder = document.createElement("textarea");
    decoder.innerHTML = withBreaks;
    return decoder.value.replace(/\s+/g, " ").trim();
  }
  return withBreaks.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/**
 * Safely renders rich HTML (or legacy plain text) from job descriptions/requirements/benefits.
 */
export function RichTextContent({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content);
  if (!looksLikeHtml) {
    return (
      <div className={`whitespace-pre-line text-sm text-ink-700 leading-relaxed ${className}`}>
        {content}
      </div>
    );
  }
  const clean = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "h3", "h4"],
    ALLOWED_ATTR: [],
  });
  return (
    <div
      className={`text-sm text-ink-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-ink-900 [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-1.5 ${className}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
