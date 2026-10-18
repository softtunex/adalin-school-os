# Adalin SchoolHub illustration briefs

For the Director to generate. Each file drops into `public/illustrations/` under the exact filename given; the app picks it up automatically, no code change needed.

## Style (applies to every image)

- **Look:** Duolingo-style flat 2D illustration. Chunky rounded geometric shapes, soft flat shading (one shadow tone per colour, no gradients), friendly exaggerated proportions, big expressive eyes. Playful, never childish or clip-art.
- **People:** Nigerian students, teachers and parents with a range of skin tones, hairstyles (braids, cornrows, afros, low cuts, hijab), and clothing (school uniforms with ties/pinafores, ankara prints, gele on one parent, kaftan on one teacher).
- **Palette (stick to it):** brand orange `#FE6007` (hero colour), blue `#1A8FD6`, green `#239A3D`, sunny yellow `#FFC83D`, pink `#F28BC1`, purple `#7C5CDB`, warm skin tones, near-black `#1D1D1F` for hair/pupils. Backgrounds: none.
- **Format:** transparent PNG (or SVG), at least 1600px on the longest side. No text, letters or numbers baked in (except the "A1" on report cards, which is fine).
- **Mascot:** one recurring character across the whole product. Suggestion: **"Kola", a cheerful orange hornbill** (a West African bird, so it's ours and doesn't copy Duolingo's owl). Orange body `#FE6007`, cream belly, big yellow-and-orange casque/beak, round white eyes, small graduation cap with a blue tassel. Should feel as friendly as Duo but clearly different.

## Files needed

| # | Filename | Size / ratio | What it shows |
|---|---|---|---|
| 1 | `mascot-wave.png` | square | Kola waving hello, full body. Used on login, sign-up and welcome screens. |
| 2 | `hero.png` | 4:3 | Homepage hero. Kola in the middle surrounded by a floating group: a schoolgirl in uniform with a backpack, a teacher holding a tablet, a parent on a phone, a boy jumping, plus floating objects: a report card with a gold star, naira coins, a green checkmark bubble, a school bell. Energetic "everyone's flying" composition like Duolingo's hero. |
| 3 | `attendance.png` | 4:3 | A teacher tapping a big tilted phone; the screen shows rows with green checkmarks; a few happy students' heads pop up beside the phone. Small "no wifi" cloud icon with the checkmarks still working (it works offline). |
| 4 | `report-cards.png` | 4:3 | A stack of chunky report cards, the top one with "A1" grades and a gold star ribbon; a student celebrating, arms up, confetti. |
| 5 | `fees.png` | 4:3 | A parent (ankara top) paying on a phone, naira coins bouncing into a piggy-bank-shaped school building, a receipt with a green tick printing out. |
| 6 | `parents.png` | 4:3 | A parent and a class teacher on two phones with friendly chat bubbles flowing between them, a heart and a thumbs-up icon. |
| 7 | `nigeria.png` | 4:3 | A cheerful school building with a Nigerian flag, three-term calendar pages flying out (1, 2, 3 is fine), a WAEC-style certificate scroll, Kola perched on the roof. |
| 8 | `empty-students.png` | square | Kola holding an empty clipboard, curious. |
| 9 | `empty-generic.png` | square | Kola relaxing on a stack of books, content. |
| 10 | `celebrate.png` | square | Kola celebrating with confetti (shown when setup is complete). |
| 11 | `not-found.png` | square | Kola looking at a map upside down, confused (404 page). |

## Animations (optional, nice to have)

If the tool can produce them: **Lottie `.json`** files (or transparent `.webm`) of the same mascot.

| Filename | Loop | What |
|---|---|---|
| `mascot-wave.json` | yes, gentle | Kola waving, blinking. Hero and login. |
| `celebrate.json` | plays once | Kola jumping with confetti burst. |
| `loading.json` | yes | Kola flapping, short loop for loading states. |
