type EvidenceFields = { evidenceIds: string[]; confidence: number };
type Education = EvidenceFields & { institutionRedacted: string | null; degreeLevel: string | null; fieldOfStudy: string | null; startMonth: string | null; endMonth: string | null };
type Language = EvidenceFields & { languageCode: string; proficiency: string | null };
type Project = EvidenceFields & { name: string; description: string | null; skillIds: string[] };
type Certificate = EvidenceFields & { name: string; issuer: string | null; issuedMonth: string | null };

export type CvDetails = {
  education: Education[];
  languages: Language[];
  projects: Project[];
  certificates: Certificate[];
};

export function CvDetailsEditor({ value, onChange }: { value: CvDetails; onChange: (patch: Partial<CvDetails>) => void }) {
  return <>
    <fieldset><legend>Học vấn</legend>
      {(value.education ?? []).map((item, index) => {
        const update = (patch: Partial<Education>) => onChange({ education: value.education.map((entry, i) => i === index ? { ...entry, ...patch } : entry) });
        return <div className="parsed-experience" key={index}>
          <label>Bằng cấp {index + 1}<select value={item.degreeLevel ?? ""} onChange={(e) => update({ degreeLevel: e.target.value || null })}>
            <option value="">Chưa rõ</option>
            {[["HIGH_SCHOOL", "THPT"], ["VOCATIONAL", "Trung cấp"], ["ASSOCIATE", "Cao đẳng"], ["BACHELOR", "Đại học"], ["MASTER", "Thạc sĩ"], ["DOCTORATE", "Tiến sĩ"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>Chuyên ngành {index + 1}<input maxLength={180} value={item.fieldOfStudy ?? ""} onChange={(e) => update({ fieldOfStudy: e.target.value || null })} /></label>
          <label>Bắt đầu học {index + 1}<input type="month" value={item.startMonth ?? ""} onChange={(e) => update({ startMonth: e.target.value || null })} /></label>
          <label>Kết thúc học {index + 1}<input type="month" min={item.startMonth ?? undefined} value={item.endMonth ?? ""} onChange={(e) => update({ endMonth: e.target.value || null })} /></label>
          <button type="button" onClick={() => onChange({ education: value.education.filter((_, i) => i !== index) })}>Xóa học vấn {index + 1}</button>
        </div>;
      })}
      <button type="button" onClick={() => onChange({ education: [...(value.education ?? []), { institutionRedacted: null, degreeLevel: null, fieldOfStudy: null, startMonth: null, endMonth: null, evidenceIds: [], confidence: 1 }] })}>Thêm học vấn</button>
    </fieldset>
    <fieldset><legend>Ngoại ngữ</legend>
      {(value.languages ?? []).map((item, index) => {
        const update = (patch: Partial<Language>) => onChange({ languages: value.languages.map((entry, i) => i === index ? { ...entry, ...patch } : entry) });
        return <div className="parsed-row" key={index}>
          <label>Ngôn ngữ {index + 1}<input maxLength={6} pattern="[a-z]{2,3}(-[A-Z]{2})?" value={item.languageCode} placeholder="en, vi, ja…" onChange={(e) => update({ languageCode: e.target.value })} /></label>
          <label>Trình độ {index + 1}<input maxLength={80} value={item.proficiency ?? ""} placeholder="B2, IELTS 6.5, N2…" onChange={(e) => update({ proficiency: e.target.value || null })} /></label>
          <button type="button" onClick={() => onChange({ languages: value.languages.filter((_, i) => i !== index) })}>Xóa ngoại ngữ {index + 1}</button>
        </div>;
      })}
      <button type="button" onClick={() => onChange({ languages: [...(value.languages ?? []), { languageCode: "en", proficiency: null, evidenceIds: [], confidence: 1 }] })}>Thêm ngoại ngữ</button>
    </fieldset>
    <fieldset><legend>Dự án</legend>
      {(value.projects ?? []).map((item, index) => {
        const update = (patch: Partial<Project>) => onChange({ projects: value.projects.map((entry, i) => i === index ? { ...entry, ...patch } : entry) });
        return <div className="parsed-experience" key={index}>
          <label>Tên dự án {index + 1}<input maxLength={240} value={item.name} onChange={(e) => update({ name: e.target.value })} /></label>
          <label>Mô tả dự án {index + 1}<textarea maxLength={2000} value={item.description ?? ""} onChange={(e) => update({ description: e.target.value || null })} /></label>
          <button type="button" onClick={() => onChange({ projects: value.projects.filter((_, i) => i !== index) })}>Xóa dự án {index + 1}</button>
        </div>;
      })}
      <button type="button" onClick={() => onChange({ projects: [...(value.projects ?? []), { name: "", description: null, skillIds: [], evidenceIds: [], confidence: 1 }] })}>Thêm dự án</button>
    </fieldset>
    <fieldset><legend>Chứng chỉ</legend>
      {(value.certificates ?? []).map((item, index) => {
        const update = (patch: Partial<Certificate>) => onChange({ certificates: value.certificates.map((entry, i) => i === index ? { ...entry, ...patch } : entry) });
        return <div className="parsed-experience" key={index}>
          <label>Tên chứng chỉ {index + 1}<input maxLength={240} value={item.name} onChange={(e) => update({ name: e.target.value })} /></label>
          <label>Đơn vị cấp {index + 1}<input maxLength={240} value={item.issuer ?? ""} onChange={(e) => update({ issuer: e.target.value || null })} /></label>
          <label>Tháng cấp {index + 1}<input type="month" value={item.issuedMonth ?? ""} onChange={(e) => update({ issuedMonth: e.target.value || null })} /></label>
          <button type="button" onClick={() => onChange({ certificates: value.certificates.filter((_, i) => i !== index) })}>Xóa chứng chỉ {index + 1}</button>
        </div>;
      })}
      <button type="button" onClick={() => onChange({ certificates: [...(value.certificates ?? []), { name: "", issuer: null, issuedMonth: null, evidenceIds: [], confidence: 1 }] })}>Thêm chứng chỉ</button>
    </fieldset>
  </>;
}
