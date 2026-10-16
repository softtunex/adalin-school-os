import type { Section } from "./sections";

export type LevelTemplate = { name: string; section: Section };
export type SubjectTemplate = { name: string; code: string; sections: Section[]; electiveIn?: Section[] };

export type CurriculumTemplate = {
  key: "nigerian" | "british";
  label: string;
  sections: { section: Section; label: string; levels: string[] }[];
  subjects: SubjectTemplate[];
  termNames: [string, string, string];
};

const N: Section = "nursery";
const P: Section = "primary";
const J: Section = "junior_secondary";
const S: Section = "senior_secondary";
const C: Section = "creche";

export const NIGERIAN: CurriculumTemplate = {
  key: "nigerian",
  label: "Nigerian",
  termNames: ["First Term", "Second Term", "Third Term"],
  sections: [
    { section: C, label: "Creche / Pre-nursery", levels: ["Creche", "Pre-Nursery"] },
    { section: N, label: "Nursery", levels: ["Nursery 1", "Nursery 2", "Kindergarten"] },
    { section: P, label: "Primary", levels: ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"] },
    { section: J, label: "Junior secondary", levels: ["JSS 1", "JSS 2", "JSS 3"] },
    { section: S, label: "Senior secondary", levels: ["SS 1", "SS 2", "SS 3"] },
  ],
  subjects: [
    { name: "Literacy", code: "LIT", sections: [C, N] },
    { name: "Numeracy", code: "NUM", sections: [C, N] },
    { name: "Phonics", code: "PHO", sections: [N] },
    { name: "Rhymes and Songs", code: "RHY", sections: [C, N] },
    { name: "Health Habits", code: "HHB", sections: [N] },
    { name: "Social Habits", code: "SHB", sections: [N] },
    { name: "Creative Arts", code: "CRA", sections: [C, N] },
    { name: "English Studies", code: "ENG", sections: [P, J] },
    { name: "English Language", code: "ENG", sections: [S] },
    { name: "Mathematics", code: "MTH", sections: [P, J, S] },
    { name: "Basic Science and Technology", code: "BST", sections: [P] },
    { name: "Basic Science", code: "BSC", sections: [N, J] },
    { name: "Basic Technology", code: "BTC", sections: [J] },
    { name: "Social Studies", code: "SST", sections: [P, J] },
    { name: "Civic Education", code: "CVE", sections: [P, J, S] },
    { name: "Security Education", code: "SEC", sections: [J] },
    { name: "Christian Religious Studies", code: "CRS", sections: [P, J, S], electiveIn: [P, J, S] },
    { name: "Islamic Religious Studies", code: "IRS", sections: [P, J, S], electiveIn: [P, J, S] },
    { name: "Cultural and Creative Arts", code: "CCA", sections: [P, J] },
    { name: "Pre-Vocational Studies", code: "PVS", sections: [P] },
    { name: "Agricultural Science", code: "AGR", sections: [J, S], electiveIn: [S] },
    { name: "Home Economics", code: "HEC", sections: [J] },
    { name: "Business Studies", code: "BUS", sections: [J] },
    { name: "Physical and Health Education", code: "PHE", sections: [P, J] },
    { name: "Computer Studies", code: "ICT", sections: [P, J, S], electiveIn: [S] },
    { name: "French", code: "FRE", sections: [P, J, S], electiveIn: [S] },
    { name: "Yoruba", code: "YOR", sections: [P, J, S], electiveIn: [S] },
    { name: "Igbo", code: "IGB", sections: [P, J, S], electiveIn: [P, J, S] },
    { name: "Hausa", code: "HAU", sections: [P, J, S], electiveIn: [P, J, S] },
    { name: "Verbal Reasoning", code: "VRB", sections: [P] },
    { name: "Quantitative Reasoning", code: "QTR", sections: [P] },
    { name: "Physics", code: "PHY", sections: [S], electiveIn: [S] },
    { name: "Chemistry", code: "CHM", sections: [S], electiveIn: [S] },
    { name: "Biology", code: "BIO", sections: [S], electiveIn: [S] },
    { name: "Further Mathematics", code: "FMT", sections: [S], electiveIn: [S] },
    { name: "Geography", code: "GEO", sections: [S], electiveIn: [S] },
    { name: "Economics", code: "ECO", sections: [S], electiveIn: [S] },
    { name: "Government", code: "GOV", sections: [S], electiveIn: [S] },
    { name: "Literature in English", code: "LIT-E", sections: [S], electiveIn: [S] },
    { name: "Financial Accounting", code: "ACC", sections: [S], electiveIn: [S] },
    { name: "Commerce", code: "COM", sections: [S], electiveIn: [S] },
    { name: "Technical Drawing", code: "TDR", sections: [S], electiveIn: [S] },
    { name: "Food and Nutrition", code: "FNT", sections: [S], electiveIn: [S] },
    { name: "Data Processing", code: "DPR", sections: [S], electiveIn: [S] },
  ],
};

export const BRITISH: CurriculumTemplate = {
  key: "british",
  label: "British",
  termNames: ["Autumn Term", "Spring Term", "Summer Term"],
  sections: [
    { section: N, label: "Early years", levels: ["Nursery", "Reception"] },
    { section: P, label: "Primary (Key Stages 1-2)", levels: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"] },
    { section: J, label: "Lower secondary (Key Stage 3)", levels: ["Year 7", "Year 8", "Year 9"] },
    { section: S, label: "Upper secondary (IGCSE and A Level)", levels: ["Year 10", "Year 11", "Year 12", "Year 13"] },
  ],
  subjects: [
    { name: "Communication and Language", code: "CL", sections: [N] },
    { name: "Physical Development", code: "PD", sections: [N] },
    { name: "Literacy", code: "LIT", sections: [N] },
    { name: "Mathematics", code: "MAT", sections: [N, P, J, S] },
    { name: "Understanding the World", code: "UW", sections: [N] },
    { name: "English", code: "ENG", sections: [P, J, S] },
    { name: "Science", code: "SCI", sections: [P, J] },
    { name: "Computing", code: "CMP", sections: [P, J, S], electiveIn: [S] },
    { name: "History", code: "HIS", sections: [P, J, S], electiveIn: [S] },
    { name: "Geography", code: "GEO", sections: [P, J, S], electiveIn: [S] },
    { name: "Art and Design", code: "ART", sections: [P, J, S], electiveIn: [S] },
    { name: "Music", code: "MUS", sections: [P, J, S], electiveIn: [S] },
    { name: "Physical Education", code: "PE", sections: [P, J, S] },
    { name: "French", code: "FRE", sections: [P, J, S], electiveIn: [S] },
    { name: "Religious Education", code: "RE", sections: [P, J] },
    { name: "PSHE", code: "PSHE", sections: [P, J, S] },
    { name: "Biology", code: "BIO", sections: [S], electiveIn: [S] },
    { name: "Chemistry", code: "CHE", sections: [S], electiveIn: [S] },
    { name: "Physics", code: "PHY", sections: [S], electiveIn: [S] },
    { name: "Economics", code: "ECO", sections: [S], electiveIn: [S] },
    { name: "Business Studies", code: "BUS", sections: [S], electiveIn: [S] },
    { name: "Further Mathematics", code: "FMA", sections: [S], electiveIn: [S] },
  ],
};

export const TEMPLATES = { nigerian: NIGERIAN, british: BRITISH } as const;
export type TemplateKey = keyof typeof TEMPLATES;

export const SECTION_LABELS: Record<Section, string> = {
  creche: "Creche",
  nursery: "Nursery",
  primary: "Primary",
  junior_secondary: "Junior secondary",
  senior_secondary: "Senior secondary",
  other: "Other",
};

/** "2026/2027" for a session starting in September 2026. Nigerian sessions start in September. */
export function sessionNameFor(date = new Date()): string {
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}/${start + 1}`;
}

export function classNameFor(level: string, arm: string | null) {
  return arm ? `${level} ${arm}` : level;
}
