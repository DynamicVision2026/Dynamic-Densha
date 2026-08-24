# Licenses and third-party audio
**Documented:** 2026-08-24
**Product:** 漢字でんしゃ / Kanji Densha
**Audio pipeline:** Pre-rendered fixed files (not live session TTS on the child path)
## Primary TTS vendor: xAI
- **Service:** xAI API Text-to-Speech (and related Output generation used to build fixed assets).
- **Governing terms (API / business):** xAI Enterprise Terms of Service + Enterprise FAQs + Acceptable Use Policy + Brand Guidelines.
  - FAQ: https://x.ai/legal/faq-enterprise/
  - Enterprise Terms: https://x.ai/legal/terms-of-service-enterprise (use the version in force on the account agreement date)
  - Brand: https://x.ai/legal/brand-guidelines
  - AUP: https://x.ai/legal/acceptable-use-policy
### Clauses we rely on (hosting + redistributing generated audio in a commercial product)
1. **Ownership of Output (Enterprise FAQ, “Who owns inputs and outputs?”)**
   “You own the Inputs and Outputs.”
   Customer owns Outputs relative to xAI; xAI retains rights set out in the Enterprise Terms. Attribution to Grok/xAI per Brand Guidelines is required when using Output / brand elements.
2. **Ownership of Output (Enterprise Terms — Output section)**
   “As between us and you, you own the Output.”
   Restrictions called out publicly include: do not represent Output as human-generated; do not use Output to train the customer’s (or similar) ML models.
3. **Production caching (xAI TTS documentation)**
   Official guidance: “Cache generated audio” when the same text is requested repeatedly.
   Our product stores pre-rendered files and serves them from our hosting/CDN to end users—consistent with caching Output bytes rather than reselling the API.
### What we do in product
- Generate reading / announcement lines offline via API (or equivalent batch).
- Host fixed files under our control; child client only fetches our URLs.
- Parent/license UI states fixed TTS files and does not claim human voice actors.
- We do not expose API keys to the client; we do not offer raw xAI API access to end users.
### Open follow-ups
- Exact Brand Guidelines string for in-app attribution line (JA/EN).
- Confirm account is under Enterprise/API terms (not consumer-only) for all generation used in production assets.
- Keep a PDF/HTML snapshot of the Enterprise Terms version dated on first commercial generation batch.
## Other assets
- **KanjiVG:** stroke logic reference; product redraws; CC BY-SA 3.0; credit on parent page (existing).
- **VOICEVOX / other JA TTS:** not primary; if ever used, each voice library terms + credit must be checked individually—not covered by this xAI section.
**Note:** This file is an internal compliance record of publicly stated terms as of the document date. It is not legal advice.
