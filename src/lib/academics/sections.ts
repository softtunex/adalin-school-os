export const SECTIONS = ["creche", "nursery", "primary", "junior_secondary", "senior_secondary", "other"] as const;
export type Section = (typeof SECTIONS)[number];
