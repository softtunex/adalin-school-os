export const MOVE_LABEL: Record<string, string> = { in: "Stock in", out: "Issued", assign: "Signed out", return: "Returned", adjust: "Count" };

/** "1 unit", "2 units": units are stored plural. */
export function unitFor(n: number, unit: string) {
  return Math.abs(n) === 1 ? unit.replace(/(?<!s)s$/, "") : unit;
}
