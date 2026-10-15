export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  success?: string;
  data?: Record<string, string>;
};

export const initialFormState: FormState = {};

export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = formData.get(key);
    if (typeof v === "string") out[key] = v;
  }
  return out;
}
