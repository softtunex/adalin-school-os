import { fillTemplate, type MergeData } from "@/lib/documents/template";

export type Brand = { name: string; logoUrl: string | null; accent: string; initials: string; signers: { name: string; title: string; signatureUrl: string | null }[] };

/** What a template fills in with when there's no real student yet. */
export function sampleData(brand: Brand, student?: { name: string; className: string | null } | null): MergeData {
  const name = student?.name ?? "Adaeze Okafor";
  return {
    name,
    first_name: name.split(" ")[0],
    admission_no: "ADC/2026/0001",
    class: student?.className ?? "JSS 1 Gold",
    parent: student ? "their parent" : "Mrs Ngozi Okafor",
    school: brand.name,
    date: new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }),
    session: "2026/2027",
    term: "First term",
  };
}

function Crest({ brand, size }: { brand: Brand; size: number }) {
  return brand.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logoUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: brand.accent, fontSize: size * 0.34 }}>
      {brand.initials}
    </span>
  );
}

function Signatures({ brand, only }: { brand: Brand; only?: number }) {
  const list = only ? brand.signers.slice(0, only) : brand.signers;
  return (
    <div className="flex flex-wrap gap-5">
      {list.map((s, i) => (
        <div key={i} className="w-32">
          <div className="flex h-8 items-end">
            {s.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.signatureUrl} alt="" className="max-h-8 max-w-28 object-contain" />
            ) : null}
          </div>
          <div className="border-t border-[#1D1D1F] pt-0.5">
            <p className="text-[9px] font-bold text-[#1D1D1F]">{s.name || `The ${s.title}`}</p>
            <p className="text-[8px] text-[#84848B]">{s.title}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A close likeness of the printed letter or certificate, filled in with sample or real details.
 * Always on white paper, whatever the app theme, because that's what prints.
 */
export function DocPreview({ kind, title, body, data, brand }: { kind: "letter" | "certificate"; title: string; body: string; data: MergeData; brand: Brand }) {
  const heading = fillTemplate(title, data);
  const text = fillTemplate(body, data);
  if (kind === "certificate") {
    return (
      <div className="aspect-[297/210] w-full overflow-hidden rounded-md bg-white p-2 shadow-card" aria-label="Certificate preview">
        <div className="flex h-full flex-col border-[3px] p-1" style={{ borderColor: brand.accent }}>
          <div className="flex h-full flex-col items-center border px-5 py-3 text-center" style={{ borderColor: brand.accent }}>
            <Crest brand={brand} size={30} />
            <p className="mt-1 text-[10px] font-bold text-[#1D1D1F]">{brand.name}</p>
            <p className="mt-2 font-serif text-[17px] font-bold leading-tight" style={{ color: brand.accent }}>
              {heading}
            </p>
            <p className="mt-1.5 text-[8px] text-[#84848B]">This certificate is presented to</p>
            <p className="font-serif text-[15px] font-bold italic text-[#1D1D1F]">{data.name}</p>
            <p className="mt-1.5 line-clamp-3 max-w-[85%] text-[8.5px] leading-snug text-[#4A4A4F]">{text}</p>
            <div className="mt-auto flex w-full items-end justify-between text-left">
              <Signatures brand={brand} />
              <span className="grid size-9 place-items-center rounded-sm border border-[#E4E2DE] bg-[#F8F7F5] text-[6px] text-[#84848B]">QR</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full overflow-hidden rounded-md bg-white px-5 py-4 shadow-card" aria-label="Letter preview">
      <div className="flex items-center gap-2 border-b-2 pb-2" style={{ borderColor: brand.accent }}>
        <Crest brand={brand} size={26} />
        <p className="text-[12px] font-bold text-[#1D1D1F]">{brand.name}</p>
      </div>
      <p className="mt-2 text-right text-[9px] text-[#4A4A4F]">{data.date}</p>
      <p className="mt-1 text-[9.5px] font-bold text-[#1D1D1F]">{data.parent}</p>
      <p className="mt-2 text-[11px] font-bold text-[#1D1D1F]">{heading}</p>
      <div className="mt-1 flex flex-col gap-1.5">
        {text.split(/\n{2,}/).map((p, i) => (
          <p key={i} className="text-[9.5px] leading-relaxed text-[#1D1D1F]">
            {p.replace(/\n/g, " ")}
          </p>
        ))}
      </div>
      <p className="mt-2 text-[9.5px] text-[#1D1D1F]">Yours faithfully,</p>
      <div className="mt-1 flex items-end justify-between">
        <Signatures brand={brand} only={1} />
        <span className="grid size-9 place-items-center rounded-sm border border-[#E4E2DE] bg-[#F8F7F5] text-[6px] text-[#84848B]">QR</span>
      </div>
    </div>
  );
}
