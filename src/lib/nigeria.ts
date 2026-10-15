export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
  "Taraba", "Yobe", "Zamfara",
] as const;

export const SCHOOL_TYPES = [
  { value: "nursery", label: "Nursery / Pre-school" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "combined", label: "Nursery, primary and secondary" },
] as const;

export const CURRICULA = [
  { value: "nigerian", label: "Nigerian (NERDC)" },
  { value: "british", label: "British" },
  { value: "american", label: "American" },
  { value: "montessori", label: "Montessori" },
  { value: "mixed", label: "Mixed" },
] as const;

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

export function formatNaira(kobo: number) {
  return naira.format(kobo / 100);
}
