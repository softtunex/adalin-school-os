import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { ordinal, RATING_SCALE, RATING_TRAITS, type Band, type StudentResult } from "./compute";

// Never split words with hyphens; report cards wrap whole words only.
Font.registerHyphenationCallback((word) => [word]);

const ORANGE = "#FE6007";
const INK = "#1D1D1F";
const BODY = "#4A4A4F";
const MUTED = "#84848B";
const LINE = "#E4E2DE";
const PAPER = "#F8F7F5";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, color: BODY, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logo: { width: 52, height: 52, borderRadius: 26, objectFit: "cover" },
  crest: { width: 52, height: 52, borderRadius: 26, backgroundColor: ORANGE, color: "#fff", fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 15 },
  schoolName: { fontSize: 17, fontFamily: "Helvetica-Bold", color: INK },
  motto: { fontSize: 8.5, fontFamily: "Helvetica-Oblique", color: MUTED, marginTop: 2 },
  address: { fontSize: 8, color: BODY, marginTop: 3 },
  title: { marginTop: 10, marginBottom: 8, textAlign: "center", fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 1 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  infoCell: { width: "25%", padding: 6, borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINE },
  infoLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },
  table: { marginTop: 10, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  headRow: { flexDirection: "row", backgroundColor: PAPER, borderBottomWidth: 1, borderBottomColor: LINE },
  th: { padding: 4.5, fontSize: 7.2, fontFamily: "Helvetica-Bold", color: BODY, textAlign: "center" },
  td: { padding: 4.5, fontSize: 8.5, textAlign: "center" },
  subject: { width: "24%", textAlign: "left" },
  num: { width: "8%" },
  remark: { width: "14%" },
  sectionTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 4 },
  twoCol: { flexDirection: "row", gap: 10, marginTop: 10 },
  box: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 7 },
  ratingRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.6 },
  comment: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 7, marginTop: 8 },
  commentLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  commentText: { fontSize: 9, color: INK, minHeight: 14 },
  signature: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  signLine: { width: 140, borderTopWidth: 1, borderTopColor: BODY, paddingTop: 2, fontSize: 7, color: MUTED, textAlign: "center" },
  key: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6, fontSize: 7, color: MUTED },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: MUTED },
  watermark: { position: "absolute", top: 330, left: 60, fontSize: 46, color: "#000", opacity: 0.05, transform: "rotate(-30deg)", fontFamily: "Helvetica-Bold" },
  fail: { color: "#D6363B", fontFamily: "Helvetica-Bold" },
});

export type ReportCardData = {
  school: { name: string; motto: string | null; address: string | null; phone: string | null; email: string | null; logo: Buffer | string | null; initials: string };
  term: { name: string; session: string };
  className: string;
  classSize: number;
  attendanceDays: number;
  nextTermBegins: string | null;
  components: { id: string; name: string; maxScore: number }[];
  subjects: { id: string; name: string }[];
  bands: Band[];
  watermark: boolean;
  students: {
    name: string;
    admissionNo: string;
    gender: string;
    age: number | null;
    result: StudentResult;
    attendance: { present: number; absent: number; late: number; excused: number };
    report: { classTeacherComment: string | null; principalComment: string | null; ratings: Record<string, number> } | null;
  }[];
};

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={s.infoCell}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function ReportCards({ data }: { data: ReportCardData }) {
  const ratingLabel = new Map(RATING_SCALE.map((r) => [r.value, r.label]));
  const sortedBands = [...data.bands].sort((a, b) => b.minScore - a.minScore);
  return (
    <Document title={`${data.className} report cards`} author={data.school.name}>
      {data.students.map((st) => {
        const r = st.result;
        const attended = st.attendance.present + st.attendance.late;
        return (
          <Page key={st.admissionNo} size="A4" style={s.page}>
            {data.watermark ? <Text style={s.watermark} fixed>School OS · Free plan</Text> : null}
            <View style={s.header}>
              {/* react-pdf images have no alt attribute; the school name sits beside the logo. */}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              {data.school.logo ? <Image src={data.school.logo} style={s.logo} /> : <Text style={s.crest}>{data.school.initials}</Text>}
              <View style={{ flex: 1 }}>
                <Text style={s.schoolName}>{data.school.name.toUpperCase()}</Text>
                {data.school.motto ? <Text style={s.motto}>{data.school.motto}</Text> : null}
                <Text style={s.address}>{[data.school.address, data.school.phone, data.school.email].filter(Boolean).join("  ·  ")}</Text>
              </View>
            </View>

            <Text style={s.title}>
              TERMINAL REPORT · {data.term.name.toUpperCase()} · {data.term.session} SESSION
            </Text>

            <View style={s.infoGrid}>
              <Info label="Student" value={st.name} />
              <Info label="Admission no" value={st.admissionNo} />
              <Info label="Class" value={data.className} />
              <Info label="Gender · Age" value={`${st.gender === "female" ? "Female" : "Male"}${st.age !== null ? ` · ${st.age}` : ""}`} />
              <Info label="Position" value={r.position ? `${ordinal(r.position)} of ${data.classSize}` : "—"} />
              <Info label="Average" value={r.average !== null ? `${r.average}%` : "—"} />
              <Info label="Attendance" value={data.attendanceDays ? `${attended} of ${data.attendanceDays} days` : "—"} />
              <Info label="Next term begins" value={data.nextTermBegins ? dateFmt.format(new Date(`${data.nextTermBegins}T00:00:00Z`)) : "—"} />
            </View>

            <View style={s.table}>
              <View style={s.headRow}>
                <Text style={[s.th, s.subject]}>SUBJECT</Text>
                {data.components.map((c) => (
                  <Text key={c.id} style={[s.th, s.num]}>
                    {`${c.name.toUpperCase()}\n/${c.maxScore}`}
                  </Text>
                ))}
                <Text style={[s.th, s.num]}>{"TOTAL\n/100"}</Text>
                <Text style={[s.th, s.num]}>GRADE</Text>
                <Text style={[s.th, s.num]}>POS.</Text>
                <Text style={[s.th, s.num]}>{"CLASS\nAVG"}</Text>
                <Text style={[s.th, s.remark]}>REMARK</Text>
              </View>
              {data.subjects
                .filter((sub) => r.subjects[sub.id]?.total !== null)
                .map((sub) => {
                  const res = r.subjects[sub.id];
                  const passes = data.bands.find((b) => b.grade === res.grade)?.passes !== false;
                  return (
                    <View key={sub.id} style={s.row} wrap={false}>
                      <Text style={[s.td, s.subject, { color: INK }]}>{sub.name}</Text>
                      {data.components.map((c) => (
                        <Text key={c.id} style={[s.td, s.num]}>
                          {res.components[c.id] ?? "—"}
                        </Text>
                      ))}
                      <Text style={[s.td, s.num, { fontFamily: "Helvetica-Bold", color: INK }]}>{res.total}</Text>
                      <Text style={[s.td, s.num, passes ? { fontFamily: "Helvetica-Bold", color: INK } : s.fail]}>{res.grade}</Text>
                      <Text style={[s.td, s.num]}>{res.position ? ordinal(res.position) : "—"}</Text>
                      <Text style={[s.td, s.num]}>{res.classAverage ?? "—"}</Text>
                      <Text style={[s.td, s.remark]}>{res.remark}</Text>
                    </View>
                  );
                })}
              <View style={[s.row, { backgroundColor: PAPER, borderBottomWidth: 0 }]}>
                <Text style={[s.td, s.subject, { fontFamily: "Helvetica-Bold", color: INK }]}>
                  {r.subjectsTaken} subjects · {r.passed} passed
                </Text>
                <Text style={[s.td, { flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold", color: INK }]}>
                  Total {r.grandTotal}   ·   Average {r.average ?? "—"}%
                </Text>
              </View>
            </View>

            <View style={s.twoCol}>
              {(["affective", "psychomotor"] as const).map((group) => (
                <View key={group} style={s.box}>
                  <Text style={s.sectionTitle}>{group === "affective" ? "BEHAVIOUR" : "SKILLS"}</Text>
                  {RATING_TRAITS[group].map((trait) => {
                    const v = st.report?.ratings?.[trait];
                    return (
                      <View key={trait} style={s.ratingRow}>
                        <Text>{trait}</Text>
                        <Text style={{ fontFamily: "Helvetica-Bold", color: INK }}>{v ? `${v} · ${ratingLabel.get(v)}` : "—"}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={s.comment} wrap={false}>
              <Text style={s.commentLabel}>Class teacher&apos;s comment</Text>
              <Text style={s.commentText}>{st.report?.classTeacherComment ?? ""}</Text>
              <View style={s.signature}>
                <Text style={s.signLine}>Class teacher</Text>
              </View>
            </View>
            <View style={s.comment} wrap={false}>
              <Text style={s.commentLabel}>Principal&apos;s comment</Text>
              <Text style={s.commentText}>{st.report?.principalComment ?? ""}</Text>
              <View style={s.signature}>
                <Text style={s.signLine}>Principal · signature and stamp</Text>
              </View>
            </View>

            <View style={s.key}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>Grading:</Text>
              {sortedBands.map((b, i) => (
                <Text key={b.grade}>
                  {b.grade} {b.minScore}–{i === 0 ? 100 : sortedBands[i - 1].minScore - 1} {b.remark}
                </Text>
              ))}
            </View>

            <View style={s.footer} fixed>
              <Text>{data.school.name} · {data.term.name}, {data.term.session}</Text>
              <Text>Generated with School OS</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
