import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { cvDocumentErrors, type CvDocument, type CvEntry } from "./cvDocument";

// Static, same-origin assets; no candidate content or font request leaves the app.
Font.register({
  family: "CvNotoSans",
  fonts: [
    { src: `${import.meta.env.BASE_URL}fonts/noto-sans/NotoSans-Regular.ttf`, fontWeight: 400 },
    { src: `${import.meta.env.BASE_URL}fonts/noto-sans/NotoSans-Bold.ttf`, fontWeight: 700 }
  ]
});
Font.registerHyphenationCallback(word => [word]);

const s = StyleSheet.create({
  page: { fontFamily: "CvNotoSans", fontSize: 10, color: "#1e293b", paddingTop: 38, paddingBottom: 42, paddingHorizontal: 42, lineHeight: 1.5 },
  header: { marginBottom: 8, borderBottomWidth: 2, borderBottomColor: "#0f766e", paddingBottom: 14 },
  name: { fontSize: 23, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 },
  headline: { fontSize: 12, color: "#0f766e", marginTop: 5 },
  contact: { fontSize: 8.5, color: "#475569", marginTop: 5 },
  heading: { fontSize: 11, fontWeight: 700, color: "#0f766e", marginTop: 13, marginBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", paddingBottom: 4 },
  entry: { marginBottom: 9 },
  title: { fontWeight: 700, fontSize: 10.5 },
  subtitle: { color: "#475569", fontSize: 9.5, marginTop: 1 },
  dates: { color: "#64748b", fontSize: 8.5, marginTop: 1, marginBottom: 3 },
  paragraph: { fontSize: 9.5, lineHeight: 1.55 },
  footer: { position: "absolute", bottom: 20, left: 42, right: 42, textAlign: "right", color: "#64748b", fontSize: 8 }
});

function clean(value: string): string { return value.trim().normalize("NFC"); }

export function hasEntryContent(entry: CvEntry): boolean {
  return [entry.title, entry.subtitle, entry.description].some(value => value.trim());
}

function dates(entry: CvEntry): string {
  return [entry.startMonth, entry.current ? "Hiện tại" : entry.endMonth].filter(Boolean).join(" - ");
}

function Heading({ children }: { children: string }) {
  return <Text style={s.heading} minPresenceAhead={38}>{children}</Text>;
}

function Entries({ label, entries }: { label: string; entries: CvEntry[] }) {
  const visible = entries.filter(hasEntryContent);
  if (!visible.length) return null;
  return <>
    <Heading>{label}</Heading>
    {visible.map(entry => <View key={entry.id} style={s.entry}>
      {entry.title.trim() && <Text style={s.title} minPresenceAhead={20}>{clean(entry.title)}</Text>}
      {entry.subtitle.trim() && <Text style={s.subtitle}>{clean(entry.subtitle)}</Text>}
      {dates(entry) && <Text style={s.dates}>{dates(entry)}</Text>}
      {entry.description.trim() && <Text style={s.paragraph} orphans={2} widows={2}>{clean(entry.description)}</Text>}
    </View>)}
  </>;
}

/** Shared source for the exact PDF bytes used by both preview and download. */
export function ClassicCvDocument({ doc }: { doc: CvDocument }) {
  return <Document title={clean(doc.title) || clean(doc.fullName)} language="vi">
    <Page size="A4" style={s.page} wrap>
      <View style={s.header}>
        <Text style={s.name}>{clean(doc.fullName)}</Text>
        {doc.headline.trim() && <Text style={s.headline}>{clean(doc.headline)}</Text>}
        {[doc.email, doc.phone, doc.location].some(value => value.trim()) &&
          <Text style={s.contact}>{[doc.email, doc.phone, doc.location].map(clean).filter(Boolean).join("  |  ")}</Text>}
        {doc.links.trim() && <Text style={s.contact}>{clean(doc.links)}</Text>}
      </View>
      {doc.introduction.trim() && <><Heading>Giới thiệu</Heading><Text style={s.paragraph}>{clean(doc.introduction)}</Text></>}
      {doc.skills.trim() && <><Heading>Kỹ năng</Heading><Text style={s.paragraph}>{clean(doc.skills)}</Text></>}
      <Entries label="Kinh nghiệm làm việc" entries={doc.experiences} />
      <Entries label="Học vấn" entries={doc.education} />
      <Entries label="Dự án" entries={doc.projects} />
      <Entries label="Chứng chỉ" entries={doc.certificates} />
      <Entries label="Ngoại ngữ" entries={doc.languages} />
      <Text fixed style={s.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </Page>
  </Document>;
}

export async function renderCvPdf(doc: CvDocument): Promise<Blob> {
  const errors = cvDocumentErrors(doc);
  if (errors.length) throw new Error(errors.join(" "));
  return pdf(<ClassicCvDocument doc={doc} />).toBlob();
}
