import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

// Whole words only, as on the report cards.
Font.registerHyphenationCallback((word) => [word]);

const ORANGE = "#FE6007";
const INK = "#1D1D1F";
const BODY = "#4A4A4F";
const MUTED = "#84848B";
const LINE = "#E4E2DE";
const PAPER = "#F8F7F5";
const GREEN = "#239A3D";
const RED = "#D6363B";

/** The PDF's built-in Helvetica has no ₦ glyph, so documents use the bank-statement style "NGN". */
export function ngn(kobo: number) {
  return `NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (rest) {
    const words = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
    parts.push(h ? `and ${words}` : words);
  }
  return parts.join(" ");
}

function wholeWords(n: number): string {
  if (n === 0) return "zero";
  const scales: [number, string][] = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of scales) {
    if (rest >= size) {
      parts.push(`${under1000(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(rest < 100 && parts.length ? `and ${under1000(rest)}` : under1000(rest));
  return parts.join(", ").replace(/, and/g, " and");
}

/** "One hundred and fifty thousand naira, fifty kobo only", as Nigerian receipts print it. */
export function amountInWords(kobo: number) {
  const naira = Math.floor(kobo / 100);
  const k = kobo % 100;
  const text = `${wholeWords(naira)} naira${k ? `, ${wholeWords(k)} kobo` : ""} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: BODY, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logo: { width: 48, height: 48, borderRadius: 24, objectFit: "cover" },
  crest: { width: 48, height: 48, borderRadius: 24, backgroundColor: ORANGE, color: "#fff", fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 15 },
  schoolName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK },
  small: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  docTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 18 },
  docTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: 1 },
  docNo: { fontSize: 10.5, fontFamily: "Courier-Bold", color: INK, marginTop: 3 },
  meta: { alignItems: "flex-end", gap: 2 },
  metaLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  metaValue: { fontSize: 9.5, color: INK, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  billTo: { marginTop: 16, flexDirection: "row", gap: 12 },
  box: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 9 },
  boxLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  strong: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK },
  table: { marginTop: 16, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  headRow: { flexDirection: "row", backgroundColor: PAPER, borderBottomWidth: 1, borderBottomColor: LINE },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE },
  th: { padding: 7, fontSize: 8, fontFamily: "Helvetica-Bold", color: BODY },
  td: { padding: 7, fontSize: 9.5, color: INK },
  desc: { flex: 1 },
  amt: { width: 130, textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 250, gap: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: INK, paddingTop: 5, marginTop: 3 },
  grandText: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: INK },
  pay: { marginTop: 20, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10, backgroundColor: PAPER },
  note: { marginTop: 14, fontSize: 8.5, color: MUTED },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
  amountBox: { marginTop: 18, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 14, alignItems: "center" },
  amountBig: { fontSize: 22, fontFamily: "Helvetica-Bold", color: INK },
  words: { fontSize: 9, color: BODY, marginTop: 4, fontFamily: "Helvetica-Oblique", textAlign: "center" },
  grid: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  cell: { width: "50%", padding: 8, borderBottomWidth: 1, borderRightWidth: 1, borderColor: LINE },
  stamp: {
    position: "absolute",
    top: 120,
    right: 50,
    borderWidth: 3,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    transform: "rotate(-12deg)",
    opacity: 0.85,
  },
});

export type SchoolHeader = { name: string; address: string | null; phone: string | null; email: string | null; logo: Buffer | string | null; initials: string };

function Header({ school }: { school: SchoolHeader }) {
  return (
    <View style={s.header}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
      {school.logo ? <Image src={school.logo} style={s.logo} /> : <Text style={s.crest}>{school.initials}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={s.schoolName}>{school.name}</Text>
        {school.address ? <Text style={s.small}>{school.address}</Text> : null}
        {school.phone || school.email ? <Text style={s.small}>{[school.phone, school.email].filter(Boolean).join("  ·  ")}</Text> : null}
      </View>
    </View>
  );
}

function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text>Generated by School OS</Text>
    </View>
  );
}

function Meta({ items }: { items: [string, ReactNode][] }) {
  return (
    <View style={s.meta}>
      {items.map(([k, v]) => (
        <View key={k} style={{ alignItems: "flex-end" }}>
          <Text style={s.metaLabel}>{k}</Text>
          <Text style={s.metaValue}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export type InvoiceDoc = {
  school: SchoolHeader;
  number: string;
  title: string;
  term: string;
  issuedOn: string;
  dueOn: string | null;
  status: "unpaid" | "partial" | "paid" | "void";
  student: { name: string; admissionNo: string; className: string | null };
  parent: string | null;
  lines: { kind: "charge" | "discount"; description: string; amountKobo: number }[];
  chargesKobo: number;
  discountKobo: number;
  paidKobo: number;
  bank: { name: string; accountNumber: string; accountName: string } | null;
  payUrl: string | null;
  note: string | null;
};

export function InvoicePdf({ doc }: { doc: InvoiceDoc }) {
  const net = doc.chargesKobo - doc.discountKobo;
  const balance = net - doc.paidKobo;
  return (
    <Document title={`${doc.number} ${doc.student.name}`} author={doc.school.name}>
      <Page size="A4" style={s.page}>
        <Header school={doc.school} />
        {doc.status === "paid" ? <Text style={[s.stamp, { color: GREEN, borderColor: GREEN }]}>PAID</Text> : null}
        {doc.status === "void" ? <Text style={[s.stamp, { color: RED, borderColor: RED }]}>VOID</Text> : null}
        <View style={s.docTitleRow}>
          <View>
            <Text style={s.docTitle}>INVOICE</Text>
            <Text style={s.docNo}>{doc.number}</Text>
            <Text style={s.small}>
              {doc.title} · {doc.term}
            </Text>
          </View>
          <Meta
            items={[
              ["Issued", doc.issuedOn],
              ["Due", doc.dueOn ?? "On receipt"],
            ]}
          />
        </View>
        <View style={s.billTo}>
          <View style={s.box}>
            <Text style={s.boxLabel}>Student</Text>
            <Text style={s.strong}>{doc.student.name}</Text>
            <Text style={s.small}>
              {doc.student.admissionNo}
              {doc.student.className ? `  ·  ${doc.student.className}` : ""}
            </Text>
          </View>
          <View style={s.box}>
            <Text style={s.boxLabel}>Bill to</Text>
            <Text style={s.strong}>{doc.parent ?? "Parent or guardian"}</Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={s.headRow}>
            <Text style={[s.th, s.desc]}>Description</Text>
            <Text style={[s.th, s.amt]}>Amount</Text>
          </View>
          {doc.lines.map((l, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={[s.td, s.desc, l.kind === "discount" ? { color: GREEN } : {}]}>{l.kind === "discount" ? `Less: ${l.description}` : l.description}</Text>
              <Text style={[s.td, s.amt, l.kind === "discount" ? { color: GREEN } : {}]}>{l.kind === "discount" ? `(${ngn(l.amountKobo)})` : ngn(l.amountKobo)}</Text>
            </View>
          ))}
        </View>
        <View style={s.totals}>
          {doc.discountKobo ? (
            <View style={s.totalRow}>
              <Text>Subtotal</Text>
              <Text>{ngn(doc.chargesKobo)}</Text>
            </View>
          ) : null}
          <View style={s.totalRow}>
            <Text>Total</Text>
            <Text style={{ color: INK, fontFamily: "Helvetica-Bold" }}>{ngn(net)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text>Paid</Text>
            <Text>{ngn(doc.paidKobo)}</Text>
          </View>
          <View style={s.grand}>
            <Text style={s.grandText}>Balance due</Text>
            <Text style={s.grandText}>{ngn(Math.max(0, balance))}</Text>
          </View>
        </View>
        {balance > 0 && doc.status !== "void" && (doc.bank || doc.payUrl) ? (
          <View style={s.pay}>
            <Text style={s.boxLabel}>How to pay</Text>
            {doc.bank ? (
              <Text style={{ color: INK }}>
                Bank transfer to {doc.bank.accountName}, {doc.bank.name}, account {doc.bank.accountNumber}. Use {doc.number} as the reference.
              </Text>
            ) : null}
            {doc.payUrl ? <Text style={{ color: INK, marginTop: doc.bank ? 4 : 0 }}>Pay online: {doc.payUrl}</Text> : null}
          </View>
        ) : null}
        {doc.note ? <Text style={s.note}>{doc.note}</Text> : null}
        <Footer left={`${doc.school.name} · ${doc.number}`} />
      </Page>
    </Document>
  );
}

export type ReceiptDoc = {
  school: SchoolHeader;
  receiptNo: string;
  paidOn: string;
  amountKobo: number;
  method: string;
  reference: string | null;
  payerName: string | null;
  receivedBy: string | null;
  status: "succeeded" | "reversed";
  student: { name: string; admissionNo: string; className: string | null };
  invoice: { number: string; title: string; term: string; totalKobo: number; balanceKobo: number };
};

export function ReceiptPdf({ doc }: { doc: ReceiptDoc }) {
  const cells: [string, string][] = [
    ["Student", doc.student.name],
    ["Admission no", doc.student.admissionNo],
    ["Class", doc.student.className ?? "—"],
    ["For", `${doc.invoice.title} · ${doc.invoice.term}`],
    ["Invoice", doc.invoice.number],
    ["Payment method", doc.method],
    ["Reference", doc.reference ?? "—"],
    ["Paid by", doc.payerName ?? "—"],
    ["Invoice total", ngn(doc.invoice.totalKobo)],
    ["Balance after this payment", ngn(Math.max(0, doc.invoice.balanceKobo))],
  ];
  return (
    <Document title={`Receipt ${doc.receiptNo}`} author={doc.school.name}>
      <Page size="A5" style={[s.page, { padding: 28 }]}>
        <Header school={doc.school} />
        {doc.status === "reversed" ? <Text style={[s.stamp, { color: RED, borderColor: RED, top: 100, right: 30 }]}>REVERSED</Text> : null}
        <View style={s.docTitleRow}>
          <View>
            <Text style={s.docTitle}>RECEIPT</Text>
            <Text style={s.docNo}>{doc.receiptNo}</Text>
          </View>
          <Meta items={[["Date", doc.paidOn]]} />
        </View>
        <View style={s.amountBox}>
          <Text style={s.metaLabel}>Amount received</Text>
          <Text style={s.amountBig}>{ngn(doc.amountKobo)}</Text>
          <Text style={s.words}>{amountInWords(doc.amountKobo)}</Text>
        </View>
        <View style={s.grid}>
          {cells.map(([k, v]) => (
            <View key={k} style={s.cell}>
              <Text style={s.boxLabel}>{k}</Text>
              <Text style={{ color: INK, fontSize: 9.5 }}>{v}</Text>
            </View>
          ))}
        </View>
        {doc.receivedBy ? <Text style={[s.note, { color: BODY }]}>Received by {doc.receivedBy}</Text> : null}
        <Footer left={`${doc.school.name} · ${doc.receiptNo}`} />
      </Page>
    </Document>
  );
}

export type OfferLetterDoc = {
  school: SchoolHeader;
  ref: string;
  date: string;
  child: string;
  guardian: string;
  address: string | null;
  level: string;
  session: string | null;
  examScore: number | null;
  acceptBy: string;
  statusUrl: string;
  principal: string | null;
};

export function OfferLetterPdf({ doc }: { doc: OfferLetterDoc }) {
  const para = { fontSize: 10.5, color: INK, lineHeight: 1.55, marginTop: 10 };
  return (
    <Document title={`Offer of admission ${doc.ref}`} author={doc.school.name}>
      <Page size="A4" style={s.page}>
        <Header school={doc.school} />
        <View style={s.docTitleRow}>
          <View>
            <Text style={s.docTitle}>OFFER OF ADMISSION</Text>
            <Text style={s.docNo}>{doc.ref}</Text>
          </View>
          <Meta items={[["Date", doc.date]]} />
        </View>
        <View style={{ marginTop: 18 }}>
          <Text style={s.strong}>{doc.guardian}</Text>
          {doc.address ? <Text style={{ fontSize: 9.5, color: BODY, marginTop: 2 }}>{doc.address}</Text> : null}
        </View>
        <Text style={[para, { marginTop: 16 }]}>Dear {doc.guardian},</Text>
        <Text style={[para, { fontFamily: "Helvetica-Bold" }]}>
          Offer of admission: {doc.child}, {doc.level}
          {doc.session ? `, ${doc.session} session` : ""}
        </Text>
        <Text style={para}>
          We are pleased to offer {doc.child} a place in {doc.level} at {doc.school.name}
          {doc.session ? ` for the ${doc.session} academic session` : ""}
          {doc.examScore !== null ? `, following a score of ${doc.examScore} in our entrance examination` : ""}. Congratulations.
        </Text>
        <Text style={para}>
          To accept this offer, please confirm on your application page by {doc.acceptBy}, after which the school will complete registration and share the fee schedule and
          resumption date. If we do not hear from you by then, the place may be offered to another child.
        </Text>
        <View style={[s.pay, { marginTop: 16 }]}>
          <Text style={s.boxLabel}>Accept or decline online</Text>
          <Text style={{ fontSize: 9.5, color: INK }}>{doc.statusUrl}</Text>
        </View>
        <Text style={para}>
          We look forward to welcoming {doc.child} to {doc.school.name}.
        </Text>
        <View style={{ marginTop: 36 }}>
          <View style={{ width: 180, borderTopWidth: 1, borderTopColor: INK, paddingTop: 4 }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: INK }}>{doc.principal ?? "The Principal"}</Text>
            <Text style={{ fontSize: 8.5, color: MUTED }}>For {doc.school.name}</Text>
          </View>
        </View>
        <Footer left={`${doc.school.name} · ${doc.ref}`} />
      </Page>
    </Document>
  );
}

export type PayslipDoc = {
  school: SchoolHeader;
  month: string;
  name: string;
  jobTitle: string | null;
  bank: string | null;
  earnings: { name: string; kobo: number }[];
  deductions: { name: string; kobo: number }[];
  gross: number;
  net: number;
  employerPension: number;
};

function PayBlock({ title, rows, total }: { title: string; rows: { name: string; kobo: number }[]; total: number }) {
  return (
    <View style={[s.table, { flex: 1, marginTop: 0 }]}>
      <View style={s.headRow}>
        <Text style={[s.th, s.desc]}>{title}</Text>
        <Text style={[s.th, { width: 110, textAlign: "right" }]}>Amount</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.row}>
          <Text style={[s.td, s.desc]}>{r.name}</Text>
          <Text style={[s.td, { width: 110, textAlign: "right" }]}>{ngn(r.kobo)}</Text>
        </View>
      ))}
      <View style={[s.row, { borderBottomWidth: 0, backgroundColor: PAPER }]}>
        <Text style={[s.td, s.desc, { fontFamily: "Helvetica-Bold" }]}>Total</Text>
        <Text style={[s.td, { width: 110, textAlign: "right", fontFamily: "Helvetica-Bold" }]}>{ngn(total)}</Text>
      </View>
    </View>
  );
}

export function PayslipPdf({ doc }: { doc: PayslipDoc }) {
  const totalDeductions = doc.deductions.reduce((t, d) => t + d.kobo, 0);
  return (
    <Document title={`Payslip ${doc.month} ${doc.name}`} author={doc.school.name}>
      <Page size="A4" style={s.page}>
        <Header school={doc.school} />
        <View style={s.docTitleRow}>
          <View>
            <Text style={s.docTitle}>PAYSLIP</Text>
            <Text style={s.docNo}>{doc.month}</Text>
          </View>
          <Meta
            items={[
              ["Paid to", doc.name],
              ["Role", doc.jobTitle ?? "Staff"],
            ]}
          />
        </View>
        <View style={{ marginTop: 18, flexDirection: "row", gap: 12 }}>
          <PayBlock title="Earnings" rows={doc.earnings} total={doc.gross} />
          <PayBlock title="Deductions" rows={doc.deductions} total={totalDeductions} />
        </View>
        <View style={s.amountBox}>
          <Text style={s.metaLabel}>Net pay</Text>
          <Text style={s.amountBig}>{ngn(doc.net)}</Text>
          <Text style={s.words}>{amountInWords(doc.net)}</Text>
        </View>
        <View style={[s.pay, { marginTop: 14 }]}>
          <Text style={s.boxLabel}>Paid into</Text>
          <Text style={{ fontSize: 9.5, color: INK }}>{doc.bank ?? "No bank account on file"}</Text>
          {doc.employerPension ? <Text style={[s.small, { marginTop: 6 }]}>The school also paid {ngn(doc.employerPension)} into your pension this month.</Text> : null}
        </View>
        <Footer left={`${doc.school.name} · Payslip ${doc.month}`} />
      </Page>
    </Document>
  );
}
