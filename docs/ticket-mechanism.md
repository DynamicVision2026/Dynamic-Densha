> Boarding pass / punched stub / 到着 sequence in this file win.

Local ticket mechanism (U1–U3 + P-Save). Not a GitHub wiki.

- **Boarding pass** (`DepartureTicket`) on child home. Same chrome for guest and account. Glyphs come from the ride board. Empty day: `data-ticket-empty`, きょうは おやすみ + `nextArrival.label`, tap still 自由乗車.
- **Punched stub** (`SessionStub`) at 到着 when this session first reaches だいたい. Mint paper. Never print かんぺき. Return copy is `nextArrival.label` from the engine (`nextArrivalFrom`). QR is `https://kanji-densha.app/` only — no query, no child/user identity. PNG from きっぷを もらう is fridge-safe.
- Day eight (second echo pass): no punched stub. Coupling owns 到着 (`れっしゃを みる` / ボードへ). Stub exists only for first arrival at だいたい. If any char in the session is already perfect, render no SessionStub.
- Empty boarding pass is live: きょうは おやすみ + `nextArrival.label`, action じゆうに のる, tap uses `pickDeparture` (never `disabled`).
- **到着 sequence:** stub + きっぷを もらう / あとで, then ボードへ / れっしゃを みる. No child ほぞんする (P-Save / B3). Do not wrap ticket chrome in `hrefHome === "/demo"`.
- Evaluation stays `evaluateProgress` + `nextArrivalFrom` + server/demo adapters. Do not add a `packages/` tree.
