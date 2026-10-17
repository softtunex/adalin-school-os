/** An allergy that matches a medicine by name, either way round ("penicillin" vs "Penicillin V"). */
export function allergyClash(allergies: string[], medicine: string) {
  // Plurals count as the same word: "groundnuts" matches "groundnut oil".
  const stem = (w: string) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  const words = (t: string) => (t.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem);
  const has = (hay: string[], needle: string[]) => needle.length > 0 && hay.some((_, i) => needle.every((w, j) => hay[i + j] === w));
  const med = words(medicine);
  const main = med.filter((w) => w.length >= 4).slice(0, 1);
  return allergies.find((a) => {
    const al = words(a);
    return (al.join("").length >= 3 && has(med, al)) || has(al, main);
  });
}
