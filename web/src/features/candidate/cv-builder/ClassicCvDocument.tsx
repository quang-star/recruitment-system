import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer";
import {
  cvDocumentErrors,
  getSectionLabel,
  isSafeCvPhotoDataUrl,
  type BodySection,
  type CvDocument,
  type CvEntry,
  type CvFontFamily,
  type CvFontSize,
  type CvLanguage,
  type CvLineSpacing,
  type Section,
} from "./cvDocument";
import { parseRichTextLines } from "./cvRichText";

// Static, same-origin assets; no candidate content or font request leaves the app.
Font.register({
  family: "CvNotoSans",
  fonts: [
    { src: `${import.meta.env.BASE_URL}fonts/noto-sans/NotoSans-Regular.ttf`, fontWeight: 400 },
    { src: `${import.meta.env.BASE_URL}fonts/noto-sans/NotoSans-Bold.ttf`, fontWeight: 700 },
    { src: `${import.meta.env.BASE_URL}fonts/noto-sans/NotoSans-Italic.ttf`, fontWeight: 400, fontStyle: "italic" },
  ],
});
Font.register({
  family: "CvNotoSerif",
  fonts: [
    { src: `${import.meta.env.BASE_URL}fonts/noto-serif/NotoSerif-Regular.ttf`, fontWeight: 400 },
    { src: `${import.meta.env.BASE_URL}fonts/noto-serif/NotoSerif-Bold.ttf`, fontWeight: 700 },
    { src: `${import.meta.env.BASE_URL}fonts/noto-serif/NotoSerif-Italic.ttf`, fontWeight: 400, fontStyle: "italic" },
  ],
});
Font.registerHyphenationCallback(word => [word]);

function resolvePdfFont(fontFamily: CvFontFamily): "CvNotoSans" | "CvNotoSerif" {
  return fontFamily === "serif" ? "CvNotoSerif" : "CvNotoSans";
}

const FONT_SCALE_DELTA: Record<CvFontSize, number> = {
  small: -0.7,
  medium: 0,
  large: 0.9,
};

const LINE_HEIGHT_MAP: Record<CvLineSpacing, number> = {
  compact: 1.32,
  normal: 1.48,
  relaxed: 1.65,
};

const base = StyleSheet.create({
  page: { fontFamily: "CvNotoSans", fontSize: 10, color: "#1e293b", paddingTop: 34, paddingBottom: 38, paddingHorizontal: 38, lineHeight: 1.48 },
  twoColPage: { fontFamily: "CvNotoSans", fontSize: 9.5, color: "#1e293b", paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0 },
  twoColBody: { flexDirection: "row", flexGrow: 1 },
  sidebarCol: { width: "33%", backgroundColor: "#f8fafc", paddingTop: 24, paddingBottom: 32, paddingHorizontal: 18, borderRightWidth: 1, borderRightColor: "#e2e8f0" },
  mainCol: { width: "67%", paddingTop: 24, paddingBottom: 32, paddingHorizontal: 24 },
  footer: { position: "absolute", bottom: 14, left: 38, right: 38, textAlign: "right", color: "#64748b", fontSize: 8 },
});

function clean(value: string): string {
  return value.trim().normalize("NFC");
}

function typoScale(doc: CvDocument) {
  const d = FONT_SCALE_DELTA[doc.fontSize];
  const lh = LINE_HEIGHT_MAP[doc.lineSpacing];
  return {
    body: 9.3 + d,
    title: 10.3 + d,
    subtitle: 9.2 + d,
    small: 8.3 + d * 0.6,
    heading: 10.8 + d,
    lh,
  };
}

export function hasEntryContent(entry: CvEntry): boolean {
  return [entry.title, entry.subtitle, entry.description].some(value => value.trim().length > 0);
}

function dates(entry: CvEntry, language: CvLanguage): string {
  const currentLabel = language === "en" ? "Present" : "Hiện tại";
  return [entry.startMonth, entry.current ? currentLabel : entry.endMonth].filter(Boolean).join(" - ");
}

function ContactIcon({ kind, color }: { kind: "email" | "phone" | "location" | "link"; color: string }) {
  const path =
    kind === "email"
      ? "M4 6h16v12H4z M4 7l8 6 8-6"
      : kind === "phone"
        ? "M6.5 4h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"
        : kind === "location"
          ? "M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
          : "M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11 4.8 M14 11a5 5 0 0 0-7.1 0L4.1 13.8a5 5 0 0 0 7.1 7.1L13 19.2";
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24" style={{ marginRight: 4.5, marginTop: 1.5 }}>
      <Path d={path} stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AvatarImage({ photoDataUrl, accent, size = 66, round = true }: { photoDataUrl: string; accent: string; size?: number; round?: boolean }) {
  if (!photoDataUrl || !isSafeCvPhotoDataUrl(photoDataUrl)) return null;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : 8,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: accent,
        flexShrink: 0,
      }}
    >
      <Image src={photoDataUrl} style={{ width: size, height: size, objectFit: "cover" }} />
    </View>
  );
}

function SectionHeading({
  children,
  accent,
  doc,
  minimal = false,
}: {
  children: string;
  accent: string;
  doc: CvDocument;
  minimal?: boolean;
}) {
  const t = typoScale(doc);
  return (
    <View
      minPresenceAhead={36}
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 11,
        marginBottom: 5.5,
        borderBottomWidth: minimal ? 0.8 : 1,
        borderBottomColor: minimal ? accent : "#e2e8f0",
        paddingBottom: 3,
      }}
    >
      {!minimal && (
        <View style={{ width: 3.5, height: 11, backgroundColor: accent, borderRadius: 2, marginRight: 6 }} />
      )}
      <Text
        style={{
          fontSize: minimal ? t.heading - 0.8 : t.heading,
          fontWeight: 700,
          color: minimal ? "#0f172a" : accent,
          textTransform: minimal ? "uppercase" : "none",
          letterSpacing: minimal ? 0.8 : 0,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function RichPdfText({
  text,
  fontSize,
  lineHeight,
  color,
}: {
  text: string;
  fontSize: number;
  lineHeight: number;
  color: string;
}) {
  const lines = parseRichTextLines(clean(text));
  return (
    <View style={{ marginTop: 2.5 }}>
      {lines.map((line, i) => {
        const inlineContent = line.runs.map((run, rIdx) => (
          <Text
            key={rIdx}
            style={{
              fontWeight: run.bold ? 700 : 400,
              fontStyle: run.italic ? "italic" : "normal",
            }}
          >
            {run.text}
          </Text>
        ));
        if (line.isBullet) {
          return (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 1.5 }}>
              <Text style={{ fontSize, lineHeight, color, width: 10 }}>•</Text>
              <Text style={{ fontSize, lineHeight, color, flex: 1 }}>{inlineContent}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={{ fontSize, lineHeight, color, marginBottom: 1.5 }}>
            {inlineContent}
          </Text>
        );
      })}
    </View>
  );
}

function EntryList({
  entries,
  doc,
  timeline = false,
}: {
  entries: CvEntry[];
  doc: CvDocument;
  timeline?: boolean;
}) {
  const visible = entries.filter(hasEntryContent);
  const t = typoScale(doc);
  return (
    <>
      {visible.map(entry => {
        const period = dates(entry, doc.language);
        return (
          <View
            key={entry.id}
            style={{
              marginBottom: 8.5,
              ...(timeline
                ? { borderLeftWidth: 1.4, borderLeftColor: "#cbd5e1", paddingLeft: 9 }
                : {}),
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1 }}>
                {entry.title.trim() && (
                  <Text style={{ fontWeight: 700, fontSize: t.title, color: "#0f172a" }} minPresenceAhead={20}>
                    {clean(entry.title)}
                  </Text>
                )}
                {entry.subtitle.trim() && (
                  <Text style={{ color: "#475569", fontSize: t.subtitle, marginTop: 1 }}>
                    {clean(entry.subtitle)}
                  </Text>
                )}
              </View>
              {period && (
                <Text style={{ color: "#64748b", fontSize: t.small, flexShrink: 0, textAlign: "right" }}>
                  {period}
                </Text>
              )}
            </View>
            {entry.description.trim() && (
              <RichPdfText text={entry.description} fontSize={t.body} lineHeight={t.lh} color="#1e293b" />
            )}
          </View>
        );
      })}
    </>
  );
}

function SkillContent({ text, accent, doc, sidebar = false }: { text: string; accent: string; doc: CvDocument; sidebar?: boolean }) {
  const t = typoScale(doc);
  const cleaned = clean(text);
  const lines = cleaned.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const isTagList = lines.length === 1 && cleaned.includes(",") && cleaned.length <= 220;
  if (isTagList && !sidebar) {
    const tags = cleaned.split(",").map(s => s.trim()).filter(Boolean).slice(0, 24);
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {tags.map((tag, idx) => (
          <Text
            key={idx}
            style={{
              fontSize: t.small,
              color: "#0f172a",
              backgroundColor: "#f1f5f9",
              borderWidth: 0.6,
              borderColor: accent,
              borderRadius: 4,
              paddingVertical: 2,
              paddingHorizontal: 6,
            }}
          >
            {tag}
          </Text>
        ))}
      </View>
    );
  }
  return <Text style={{ fontSize: t.body, lineHeight: t.lh, color: "#1e293b" }}>{cleaned}</Text>;
}

function visibleOrderedSections(doc: CvDocument): BodySection[] {
  const hidden = new Set(doc.hiddenSections);
  return doc.sectionOrder.filter(section => !hidden.has(section));
}

function renderBodySection(
  section: BodySection,
  doc: CvDocument,
  accent: string,
  options: { minimal?: boolean; sidebar?: boolean } = {},
) {
  const { minimal = false, sidebar = false } = options;
  const heading = getSectionLabel(section, doc.language, doc.sectionTitles);
  const t = typoScale(doc);

  if (section === "introduction") {
    if (!doc.introduction.trim()) return null;
    return (
      <View key={section}>
        <SectionHeading accent={accent} doc={doc} minimal={minimal}>{heading}</SectionHeading>
        <RichPdfText text={doc.introduction} fontSize={t.body} lineHeight={t.lh} color="#1e293b" />
      </View>
    );
  }
  if (section === "skills") {
    if (!doc.skills.trim()) return null;
    return (
      <View key={section}>
        <SectionHeading accent={accent} doc={doc} minimal={minimal}>{heading}</SectionHeading>
        <SkillContent text={doc.skills} accent={accent} doc={doc} sidebar={sidebar} />
      </View>
    );
  }
  const entries = doc[section as Section];
  const visible = entries.filter(hasEntryContent);
  if (!visible.length) return null;
  const timeline = !minimal && !sidebar && (section === "experiences" || section === "projects" || section === "activities");
  return (
    <View key={section}>
      <SectionHeading accent={accent} doc={doc} minimal={minimal}>{heading}</SectionHeading>
      <EntryList entries={visible} doc={doc} timeline={timeline} />
    </View>
  );
}

function hasAnyContact(doc: CvDocument): boolean {
  return [doc.email, doc.phone, doc.location, doc.links, doc.dateOfBirth, doc.gender]
    .some(v => v.trim().length > 0);
}

function ContactList({ doc, color, iconColor }: { doc: CvDocument; color: string; iconColor: string }) {
  const t = typoScale(doc);
  const rows: { kind: "email" | "phone" | "location" | "link"; value: string }[] = [];
  if (doc.email.trim()) rows.push({ kind: "email", value: clean(doc.email) });
  if (doc.phone.trim()) rows.push({ kind: "phone", value: clean(doc.phone) });
  if (doc.location.trim()) rows.push({ kind: "location", value: clean(doc.location) });
  if (doc.links.trim()) rows.push({ kind: "link", value: clean(doc.links) });
  const personal = [doc.dateOfBirth.trim(), doc.gender.trim()].filter(Boolean).join(" · ");
  return (
    <>
      {rows.map((row, idx) => (
        <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 3 }}>
          <ContactIcon kind={row.kind} color={iconColor} />
          <Text style={{ fontSize: t.small, color, flex: 1 }}>{row.value}</Text>
        </View>
      ))}
      {personal && (
        <Text style={{ fontSize: t.small, color, marginTop: 1 }}>{clean(personal)}</Text>
      )}
    </>
  );
}

function ClassicPage({ doc }: { doc: CvDocument }) {
  const accent = doc.accentColor;
  const fontFamily = resolvePdfFont(doc.fontFamily);
  return (
    <Page size="A4" style={[base.page, { fontFamily }]} wrap>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          marginBottom: 8,
          borderBottomWidth: 2,
          borderBottomColor: accent,
          paddingBottom: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 21 + FONT_SCALE_DELTA[doc.fontSize], fontWeight: 700, color: "#0f172a", lineHeight: 1.24 }}>
            {clean(doc.fullName)}
          </Text>
          {doc.headline.trim() && (
            <Text style={{ fontSize: 11.2 + FONT_SCALE_DELTA[doc.fontSize], fontWeight: 700, color: accent, marginTop: 3 }}>
              {clean(doc.headline)}
            </Text>
          )}
          <View style={{ marginTop: 6 }}>
            <ContactList doc={doc} color="#475569" iconColor={accent} />
          </View>
        </View>
        <AvatarImage photoDataUrl={doc.photoDataUrl} accent={accent} size={68} round={false} />
      </View>
      {visibleOrderedSections(doc).map(section => renderBodySection(section, doc, accent))}
      <Text fixed style={base.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  );
}

function ModernPage({ doc }: { doc: CvDocument }) {
  const accent = doc.accentColor;
  const fontFamily = resolvePdfFont(doc.fontFamily);
  const sidebarSet = new Set<BodySection>(["skills", "languages", "certificates", "hobbies"]);
  const ordered = visibleOrderedSections(doc);
  const sidebarSections = ordered.filter(section => sidebarSet.has(section));
  const mainSections = ordered.filter(section => !sidebarSet.has(section));
  const contactTitle = doc.language === "en" ? "Contact" : "Liên hệ";

  return (
    <Page size="A4" style={[base.twoColPage, { fontFamily }]} wrap>
      <View style={base.twoColBody}>
        <View style={[base.sidebarCol, { borderTopWidth: 5, borderTopColor: accent }]}>
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            {doc.photoDataUrl && isSafeCvPhotoDataUrl(doc.photoDataUrl) && (
              <View style={{ marginBottom: 9 }}>
                <AvatarImage photoDataUrl={doc.photoDataUrl} accent={accent} size={74} round />
              </View>
            )}
            <Text style={{ fontSize: 16.5 + FONT_SCALE_DELTA[doc.fontSize], fontWeight: 700, color: "#0f172a", lineHeight: 1.25, textAlign: "center" }}>
              {clean(doc.fullName)}
            </Text>
            {doc.headline.trim() && (
              <Text style={{ fontSize: 9.8 + FONT_SCALE_DELTA[doc.fontSize], fontWeight: 700, color: accent, marginTop: 3, textAlign: "center" }}>
                {clean(doc.headline)}
              </Text>
            )}
          </View>
          {hasAnyContact(doc) && (
            <View style={{ marginBottom: 6 }}>
              <SectionHeading accent={accent} doc={doc}>{contactTitle}</SectionHeading>
              <ContactList doc={doc} color="#334155" iconColor={accent} />
            </View>
          )}
          {sidebarSections.map(section => renderBodySection(section, doc, accent, { sidebar: true }))}
        </View>
        <View style={base.mainCol}>
          {mainSections.map(section => renderBodySection(section, doc, accent))}
        </View>
      </View>
      <Text fixed style={base.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  );
}

function ExecutivePage({ doc }: { doc: CvDocument }) {
  const accent = doc.accentColor;
  const fontFamily = resolvePdfFont(doc.fontFamily);
  const sidebarSet = new Set<BodySection>(["skills", "languages", "certificates", "hobbies"]);
  const ordered = visibleOrderedSections(doc);
  const sidebarSections = ordered.filter(section => sidebarSet.has(section));
  const mainSections = ordered.filter(section => !sidebarSet.has(section));
  const contactTitle = doc.language === "en" ? "Contact" : "Liên hệ";

  return (
    <Page size="A4" style={[base.twoColPage, { fontFamily }]} wrap>
      <View
        style={{
          backgroundColor: accent,
          paddingVertical: 20,
          paddingHorizontal: 26,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <AvatarImage photoDataUrl={doc.photoDataUrl} accent="#ffffff" size={70} round />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 21 + FONT_SCALE_DELTA[doc.fontSize], fontWeight: 700, color: "#ffffff", lineHeight: 1.22 }}>
            {clean(doc.fullName)}
          </Text>
          {doc.headline.trim() && (
            <Text style={{ fontSize: 11 + FONT_SCALE_DELTA[doc.fontSize], color: "#f8fafc", marginTop: 3 }}>
              {clean(doc.headline)}
            </Text>
          )}
        </View>
      </View>
      <View style={base.twoColBody}>
        <View style={base.sidebarCol}>
          {hasAnyContact(doc) && (
            <View style={{ marginBottom: 6 }}>
              <SectionHeading accent={accent} doc={doc}>{contactTitle}</SectionHeading>
              <ContactList doc={doc} color="#334155" iconColor={accent} />
            </View>
          )}
          {sidebarSections.map(section => renderBodySection(section, doc, accent, { sidebar: true }))}
        </View>
        <View style={base.mainCol}>
          {mainSections.map(section => renderBodySection(section, doc, accent))}
        </View>
      </View>
      <Text fixed style={base.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  );
}

function MinimalPage({ doc }: { doc: CvDocument }) {
  const accent = doc.accentColor;
  const fontFamily = resolvePdfFont(doc.fontFamily);
  return (
    <Page size="A4" style={[base.page, { fontFamily }]} wrap>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          borderLeftWidth: 4,
          borderLeftColor: accent,
          paddingLeft: 14,
          marginBottom: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 21 + FONT_SCALE_DELTA[doc.fontSize], fontWeight: 700, color: "#0f172a", lineHeight: 1.22 }}>
            {clean(doc.fullName)}
          </Text>
          {doc.headline.trim() && (
            <Text style={{ fontSize: 10.8 + FONT_SCALE_DELTA[doc.fontSize], color: "#475569", marginTop: 3 }}>
              {clean(doc.headline)}
            </Text>
          )}
          <View style={{ marginTop: 6 }}>
            <ContactList doc={doc} color="#64748b" iconColor={accent} />
          </View>
        </View>
        <AvatarImage photoDataUrl={doc.photoDataUrl} accent={accent} size={62} round />
      </View>
      {visibleOrderedSections(doc).map(section => renderBodySection(section, doc, accent, { minimal: true }))}
      <Text fixed style={base.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  );
}

/** Shared source for the exact PDF bytes used by both preview and download. */
export function ClassicCvDocument({ doc }: { doc: CvDocument }) {
  return (
    <Document title={clean(doc.title) || clean(doc.fullName)} language={doc.language}>
      {doc.templateId === "executive"
        ? <ExecutivePage doc={doc} />
        : doc.templateId === "modern"
          ? <ModernPage doc={doc} />
          : doc.templateId === "minimal"
            ? <MinimalPage doc={doc} />
            : <ClassicPage doc={doc} />}
    </Document>
  );
}

export async function renderCvPdf(doc: CvDocument): Promise<Blob> {
  const errors = cvDocumentErrors(doc);
  if (errors.length) throw new Error(errors.join(" "));
  return pdf(<ClassicCvDocument doc={doc} />).toBlob();
}
