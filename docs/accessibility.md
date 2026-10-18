# Accessibility

Target: **WCAG 2.2 AA**. Checked automatically by `e2e/accessibility.spec.ts` (axe-core) on every CI run, across public pages, the proprietor's main pages and a teacher's register. Any new violation fails the build.

## What was fixed (Phase 8)

- Text colours now meet 4.5:1 on white and paper: muted grey `#6b6b73`, link blue `#1670b0`, green `#1b7a30`, amber `#8a5c00`, orange text `#b84300`. They're tokens in `src/app/globals.css`, so every screen follows.
- Avatar colours deepened so white initials meet 4.5:1.
- The marketing footer sits on a deeper orange (`#b84300`) so its white text meets 4.5:1.
- Every progress bar has an accessible name ("Collected", "Handed in", the stat it belongs to).
- Code examples on `/developers` can be scrolled from the keyboard.

## Brand decision: Adalin orange behind white text

White text on the brand orange `#FE6007` is 3.0:1. AA asks 4.5:1 for normal text (3:1 for large, bold text of 19px and up). This affects primary buttons, the brand badges and the step dots. On 18 Oct 2026 the Director decided to keep `#FE6007` as the default brand colour, so this is a known, accepted exception. The accessibility test sets aside exactly that colour pair and still fails on anything else.

Mitigations already in place: button text is bold, orange text on light backgrounds uses the deeper `#b84300`, and schools can set their own colour in Settings.

## Checking by hand

Automated checks catch about half of real problems. Before launch, also check with a keyboard only (Tab through each core flow: every control reachable, focus always visible) and with a screen reader (TalkBack on Android, which most parents use).
