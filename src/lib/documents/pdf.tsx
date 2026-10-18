import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SchoolHeader } from "../fees/documents";

// Whole words only: no "Ogunl-eye" on a certificate.
Font.registerHyphenationCallback((word) => [word]);

const ORANGE = "#FE6007";
const INK = "#1D1D1F";
const BODY = "#4A4A4F";
const MUTED = "#84848B";
const LINE = "#E4E2DE";
const PAPER = "#F8F7F5";

const accentOf = (school: SchoolHeader) => school.accent ?? ORANGE;

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: BODY, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12, borderBottomWidth: 2 },
  logo: { width: 52, height: 52, borderRadius: 26, objectFit: "cover" },
  crest: { width: 52, height: 52, borderRadius: 26, color: "#fff", fontSize: 17, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 16 },
  schoolName: { fontSize: 17, fontFamily: "Helvetica-Bold", color: INK },
  small: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 1.2, textAlign: "center", marginTop: 24 },
  serial: { fontSize: 9, fontFamily: "Courier-Bold", color: MUTED, textAlign: "center", marginTop: 4 },
  para: { fontSize: 11, color: INK, lineHeight: 1.6, marginTop: 10 },
  verify: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderWidth: 1, borderColor: LINE, borderRadius: 4, backgroundColor: PAPER },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
});

export type Verify = { qr: string; url: string; serial: string };
/** A person who signs, with their signature image if one was uploaded. */
export type Signatory = { name: string; title: string; signature?: Buffer | string | null };

function Header({ school }: { school: SchoolHeader }) {
  const accent = accentOf(school);
  return (
    <View style={[s.header, { borderBottomColor: accent }]}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
      {school.logo ? <Image src={school.logo} style={s.logo} /> : <Text style={[s.crest, { backgroundColor: accent }]}>{school.initials}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={s.schoolName}>{school.name}</Text>
        {school.address ? <Text style={s.small}>{school.address}</Text> : null}
        {school.phone || school.email ? <Text style={s.small}>{[school.phone, school.email].filter(Boolean).join("  ·  ")}</Text> : null}
      </View>
    </View>
  );
}

/** One signature: the image (if uploaded) over a line, then the name and title. */
function Signature({ sign, school, width = 170 }: { sign: Signatory; school: string; width?: number }) {
  return (
    <View style={{ width }}>
      <View style={{ height: 34, justifyContent: "flex-end" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
        {sign.signature ? <Image src={sign.signature} style={{ maxHeight: 34, maxWidth: width - 20, objectFit: "contain" }} /> : null}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: INK, paddingTop: 4 }}>
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: INK }}>{sign.name || `The ${sign.title}`}</Text>
        <Text style={{ fontSize: 8.5, color: MUTED }}>{sign.name ? sign.title : `For ${school}`}</Text>
      </View>
    </View>
  );
}

function VerifyBox({ verify }: { verify: Verify }) {
  const cut = verify.url.indexOf("/verify/") + 8;
  return (
    <View style={s.verify}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
      <Image src={verify.qr} style={{ width: 62, height: 62 }} />
      <View style={{ width: 150 }}>
        <Text style={{ fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 }}>Check it&apos;s genuine</Text>
        <Text style={{ fontSize: 8, color: INK, marginTop: 3 }}>Scan the code, or visit</Text>
        {/* Two lines: the address doesn't break on its own, and words aren't split. */}
        <Text style={{ fontSize: 7, color: INK, marginTop: 1 }}>{verify.url.slice(0, cut)}</Text>
        <Text style={{ fontSize: 7, color: INK }}>{verify.url.slice(cut)}</Text>
        <Text style={{ fontSize: 8, fontFamily: "Courier-Bold", color: INK, marginTop: 3 }}>{verify.serial}</Text>
      </View>
    </View>
  );
}

/** The date and every signatory side by side, with the check box underneath on the right. */
function SignAndVerify({ signs, verify, date, school }: { signs: Signatory[]; verify: Verify; date: string; school: string }) {
  return (
    <View style={{ marginTop: 30 }} wrap={false}>
      {date ? <Text style={{ fontSize: 9.5, color: MUTED }}>{date}</Text> : null}
      <View style={{ flexDirection: "row", gap: 28, marginTop: 6, flexWrap: "wrap" }}>
        {signs.map((sg, i) => (
          <Signature key={i} sign={sg} school={school} width={signs.length > 2 ? 150 : 170} />
        ))}
      </View>
      <View style={{ marginTop: 16, alignItems: "flex-end" }}>
        <VerifyBox verify={verify} />
      </View>
    </View>
  );
}

function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text>Generated by Adalin SchoolHub</Text>
    </View>
  );
}

// ---------- ID cards ----------

export type IdCard = {
  holderName: string;
  photo: Buffer | string | null;
  initials: string;
  lines: [string, string][];
  kind: string;
  /** Who to call if the holder is found unwell or lost (students: a parent). */
  emergency: string | null;
  verify: Verify;
};

const CARD_W = 243; // 85.6mm
const CARD_H = 153; // 54mm
const PER_PAGE = 8;

function CardFront({ c, school, session }: { c: IdCard; school: SchoolHeader; session: string }) {
  const accent = accentOf(school);
  return (
    <View style={{ width: CARD_W, height: CARD_H, borderWidth: 0.75, borderColor: LINE, borderRadius: 8, overflow: "hidden" }} wrap={false}>
      <View style={{ backgroundColor: accent, paddingVertical: 5, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
        {school.logo ? <Image src={school.logo} style={{ width: 18, height: 18, borderRadius: 9 }} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#fff" }}>{school.name}</Text>
          <Text style={{ fontSize: 6, color: "#fff", opacity: 0.85 }}>
            {c.kind} identity card · {session}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", padding: 8, gap: 8, flex: 1 }}>
        <View style={{ width: 56 }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          {c.photo ? (
            <Image src={c.photo} style={{ width: 56, height: 68, borderRadius: 4, objectFit: "cover" }} />
          ) : (
            <Text style={{ width: 56, height: 68, borderRadius: 4, backgroundColor: PAPER, color: MUTED, fontSize: 18, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 23 }}>{c.initials}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: INK }}>{c.holderName}</Text>
          {c.lines.map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", marginTop: 3 }}>
              <Text style={{ width: 38, fontSize: 6.5, color: MUTED }}>{k}</Text>
              <Text style={{ flex: 1, fontSize: 7.5, color: INK, fontFamily: "Helvetica-Bold" }}>{v}</Text>
            </View>
          ))}
        </View>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
        <Image src={c.verify.qr} style={{ width: 54, height: 54, alignSelf: "flex-end" }} />
      </View>
      <View style={{ borderTopWidth: 0.5, borderTopColor: LINE, paddingVertical: 3, paddingHorizontal: 8, flexDirection: "row", justifyContent: "flex-end" }}>
        <Text style={{ fontSize: 5.5, fontFamily: "Courier-Bold", color: MUTED }}>{c.verify.serial}</Text>
      </View>
    </View>
  );
}

function CardBack({ c, school, session, note, sign }: { c: IdCard; school: SchoolHeader; session: string; note: string; sign: Signatory | null }) {
  const accent = accentOf(school);
  return (
    <View style={{ width: CARD_W, height: CARD_H, borderWidth: 0.75, borderColor: LINE, borderRadius: 8, overflow: "hidden" }} wrap={false}>
      <View style={{ height: 6, backgroundColor: accent }} />
      <View style={{ padding: 9, flex: 1, gap: 5 }}>
        <Text style={{ fontSize: 7, color: INK, lineHeight: 1.35 }}>{note}</Text>
        <View style={{ gap: 1.5 }}>
          <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: INK }}>{school.name}</Text>
          {school.address ? <Text style={{ fontSize: 6.5, color: BODY }}>{school.address}</Text> : null}
          {school.phone ? <Text style={{ fontSize: 6.5, color: BODY }}>Tel: {school.phone}</Text> : null}
          {school.email ? <Text style={{ fontSize: 6.5, color: BODY }}>{school.email}</Text> : null}
        </View>
        {c.emergency ? (
          <View style={{ backgroundColor: PAPER, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 5 }}>
            <Text style={{ fontSize: 5.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 }}>In an emergency, call</Text>
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: INK }}>{c.emergency}</Text>
          </View>
        ) : null}
        <View style={{ marginTop: "auto", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Text style={{ fontSize: 6, color: MUTED }}>Valid for {session}</Text>
          {sign ? (
            <View style={{ width: 90, alignItems: "center" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
              {sign.signature ? <Image src={sign.signature} style={{ maxHeight: 18, maxWidth: 80, objectFit: "contain" }} /> : <View style={{ height: 12 }} />}
              <View style={{ borderTopWidth: 0.5, borderTopColor: INK, width: 90, paddingTop: 1 }}>
                <Text style={{ fontSize: 5.5, color: MUTED, textAlign: "center" }}>{sign.title}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const cardPage = { padding: 36, flexDirection: "row", flexWrap: "wrap", gap: 18, alignContent: "flex-start", justifyContent: "center" } as const;

/**
 * ID cards at bank-card size, eight to an A4 sheet. Each sheet of fronts is followed by its
 * backs, mirrored left to right, so printing double-sided (flip on the long edge) lines them up.
 */
export function IdCardsPdf({ school, session, note, cards, sign }: { school: SchoolHeader; session: string; note: string; cards: IdCard[]; sign: Signatory | null }) {
  const sheets: IdCard[][] = [];
  for (let i = 0; i < cards.length; i += PER_PAGE) sheets.push(cards.slice(i, i + PER_PAGE));
  return (
    <Document title={`ID cards ${session}`} author={school.name}>
      {sheets.flatMap((sheet, p) => {
        // Swap each pair so card 1's back sits behind card 1 when the sheet is turned over.
        const backs: (IdCard | null)[] = [];
        for (let i = 0; i < sheet.length; i += 2) backs.push(sheet[i + 1] ?? null, sheet[i]);
        return [
          <Page key={`f${p}`} size="A4" style={cardPage}>
            {sheet.map((c, i) => (
              <CardFront key={i} c={c} school={school} session={session} />
            ))}
          </Page>,
          <Page key={`b${p}`} size="A4" style={cardPage}>
            {backs.map((c, i) => (c ? <CardBack key={i} c={c} school={school} session={session} note={note} sign={sign} /> : <View key={i} style={{ width: CARD_W, height: CARD_H }} />))}
          </Page>,
        ];
      })}
    </Document>
  );
}

// ---------- Testimonial ----------

export type TestimonialDoc = {
  school: SchoolHeader;
  name: string;
  admissionNo: string;
  gender: string;
  dateOfBirth: string | null;
  yearsFrom: string;
  yearsTo: string;
  lastClass: string;
  conduct: string;
  offices: string;
  activities: string;
  remark: string;
  date: string;
  signs: Signatory[];
  verify: Verify;
};

export function TestimonialPdf({ d }: { d: TestimonialDoc }) {
  const female = d.gender === "female";
  const rows: [string, string][] = [
    ["Name", d.name],
    ["Admission number", d.admissionNo],
    ...(d.dateOfBirth ? ([["Date of birth", d.dateOfBirth]] as [string, string][]) : []),
    ["Years at the school", `${d.yearsFrom} to ${d.yearsTo}`],
    ["Last class", d.lastClass],
    ["Conduct", d.conduct],
    ...(d.offices ? ([["Offices held", d.offices]] as [string, string][]) : []),
    ...(d.activities ? ([["Clubs and activities", d.activities]] as [string, string][]) : []),
  ];
  return (
    <Document title={`Testimonial ${d.name}`} author={d.school.name}>
      <Page size="A4" style={s.page}>
        <Header school={d.school} />
        <Text style={s.title}>TESTIMONIAL</Text>
        <Text style={s.serial}>{d.verify.serial}</Text>
        <Text style={[s.para, { marginTop: 20 }]}>To whom it may concern,</Text>
        <Text style={s.para}>
          This is to certify that {d.name} was a student of {d.school.name} from {d.yearsFrom} to {d.yearsTo}, leaving from {d.lastClass}. {female ? "She" : "He"} conducted {female ? "herself" : "himself"}{" "}
          {d.conduct.toLowerCase() === "fair" ? "fairly" : "well"} throughout, and {female ? "her" : "his"} conduct is rated {d.conduct.toLowerCase()}.
        </Text>
        <View style={{ marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4 }}>
          {rows.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: "row", borderTopWidth: i ? 1 : 0, borderTopColor: LINE }}>
              <Text style={{ width: 150, padding: 7, fontSize: 9, color: MUTED, backgroundColor: PAPER }}>{k}</Text>
              <Text style={{ flex: 1, padding: 7, fontSize: 10, color: INK }}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={s.para}>{d.remark}</Text>
        <Text style={s.para}>
          We recommend {female ? "her" : "him"} without hesitation and wish {female ? "her" : "him"} every success.
        </Text>
        <SignAndVerify signs={d.signs} verify={d.verify} date={d.date} school={d.school.name} />
        <Footer left={`${d.school.name} · ${d.verify.serial}`} />
      </Page>
    </Document>
  );
}

// ---------- Certificates ----------

export type CertificateDoc = { name: string; heading: string; body: string; verify: Verify };

/** Landscape certificates with a double border in the school colour, one per page. */
export function CertificatesPdf({ school, docs, date, signs }: { school: SchoolHeader; docs: CertificateDoc[]; date: string; signs: Signatory[] }) {
  const accent = accentOf(school);
  return (
    <Document title="Certificates" author={school.name}>
      {docs.map((d, i) => (
        <Page key={i} size="A4" orientation="landscape" style={{ padding: 24 }}>
          <View style={{ flex: 1, borderWidth: 3, borderColor: accent, padding: 5 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: accent, paddingVertical: 24, paddingHorizontal: 36, alignItems: "center" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
              {school.logo ? <Image src={school.logo} style={{ width: 56, height: 56, borderRadius: 28 }} /> : <Text style={[s.crest, { backgroundColor: accent, width: 56, height: 56, borderRadius: 28, paddingTop: 18 }]}>{school.initials}</Text>}
              <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: INK, marginTop: 6 }}>{school.name}</Text>
              <Text style={{ fontSize: 28, fontFamily: "Times-Bold", color: accent, marginTop: 16, letterSpacing: 1 }}>{d.heading}</Text>
              <Text style={{ fontSize: 11, color: MUTED, marginTop: 12 }}>This certificate is presented to</Text>
              <Text style={{ fontSize: 26, fontFamily: "Times-BoldItalic", color: INK, marginTop: 6 }}>{d.name}</Text>
              <View style={{ width: 360, height: 1, backgroundColor: LINE, marginTop: 4 }} />
              <Text style={{ fontSize: 12, color: BODY, marginTop: 12, textAlign: "center", lineHeight: 1.55, maxWidth: 580 }}>{d.body}</Text>
              <View style={{ marginTop: "auto", width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View>
                  <Text style={{ fontSize: 9.5, color: MUTED, marginBottom: 4 }}>{date}</Text>
                  <View style={{ flexDirection: "row", gap: 24 }}>
                    {signs.map((sg, j) => (
                      <Signature key={j} sign={sg} school={school.name} width={signs.length > 2 ? 140 : 160} />
                    ))}
                  </View>
                </View>
                <VerifyBox verify={d.verify} />
              </View>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}

// ---------- Letters ----------

export type LetterDoc = { to: string; heading: string; body: string; verify: Verify };

/** Letters carry one signature: the first signatory's. */
export function LettersPdf({ school, docs, date, sign }: { school: SchoolHeader; docs: LetterDoc[]; date: string; sign: Signatory }) {
  return (
    <Document title="Letters" author={school.name}>
      {docs.map((d, i) => (
        <Page key={i} size="A4" style={s.page}>
          <Header school={school} />
          <Text style={{ marginTop: 18, fontSize: 10, color: BODY, textAlign: "right" }}>{date}</Text>
          <Text style={{ marginTop: 10, fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK }}>{d.to}</Text>
          <Text style={{ marginTop: 16, fontSize: 12, fontFamily: "Helvetica-Bold", color: INK }}>{d.heading}</Text>
          {d.body.split(/\n{2,}/).map((p, j) => (
            <Text key={j} style={s.para}>
              {p.replace(/\n/g, " ")}
            </Text>
          ))}
          <Text style={[s.para, { marginTop: 16 }]}>Yours faithfully,</Text>
          <SignAndVerify signs={[sign]} verify={d.verify} date="" school={school.name} />
          <Footer left={`${school.name} · ${d.verify.serial}`} />
        </Page>
      ))}
    </Document>
  );
}

// ---------- Transcript ----------

export type TranscriptBlock = { term: string; className: string; subjects: { name: string; total: number | null; grade: string | null }[]; average: number | null; position: number | null; classSize: number };
export type TranscriptDoc = { school: SchoolHeader; name: string; admissionNo: string; className: string | null; blocks: TranscriptBlock[]; date: string; signs: Signatory[]; verify: Verify };

export function TranscriptPdf({ d }: { d: TranscriptDoc }) {
  return (
    <Document title={`Transcript ${d.name}`} author={d.school.name}>
      <Page size="A4" style={s.page}>
        <Header school={d.school} />
        <Text style={s.title}>ACADEMIC TRANSCRIPT</Text>
        <Text style={s.serial}>{d.verify.serial}</Text>
        <View style={{ marginTop: 16, flexDirection: "row", gap: 24 }}>
          {[
            ["Name", d.name],
            ["Admission number", d.admissionNo],
            ["Class", d.className ?? "—"],
          ].map(([k, v]) => (
            <View key={k}>
              <Text style={{ fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 }}>{k}</Text>
              <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </View>
        {d.blocks.map((b) => (
          <View key={b.term} style={{ marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4 }} wrap={false}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: PAPER, padding: 7 }}>
              <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK }}>
                {b.term} · {b.className}
              </Text>
              <Text style={{ fontSize: 9, color: BODY }}>
                Average {b.average ?? "—"}
                {b.position ? ` · position ${b.position} of ${b.classSize}` : ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {b.subjects.map((x) => (
                <View key={x.name} style={{ width: "50%", flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 7, borderTopWidth: 1, borderTopColor: LINE }}>
                  <Text style={{ fontSize: 9, color: INK }}>{x.name}</Text>
                  <Text style={{ fontSize: 9, color: INK, fontFamily: "Helvetica-Bold" }}>
                    {x.total} {x.grade ? `(${x.grade})` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        <SignAndVerify signs={d.signs} verify={d.verify} date={d.date} school={d.school.name} />
        <Footer left={`${d.school.name} · ${d.verify.serial}`} />
      </Page>
    </Document>
  );
}
