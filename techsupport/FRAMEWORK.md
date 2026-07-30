# Tech Support AI — System Framework & Paths Forward

Distilled from TechSupport.pdf (Zack's exploratory conversation) + adapted to Langmuir's existing infrastructure (Railway/Postgres/Epicor BAQ pattern from the MRP work).

---

## 1. The problem, in numbers (last month's RingCentral data)

| Metric | Value |
|---|---|
| Inbound calls | 3,110 |
| Answered | 1,550 |
| **Abandoned** | **1,560 (50%)** |
| Crossfire Pro XR queue | 53% abandon, 9:11 AHT |
| Apollo queue | 61% abandon, 11:30 AHT |
| General Inquiry | 722 abandoned, 2:48 AHT → routing problem, not capacity |
| TITAN (benchmark) | 29% abandon — study what this queue does differently |

Plus: heavy, varied Zendesk volume (spam, solicitations, complaints, quotes, technical) still routed and answered manually.

## 2. Decisions already reached in the PDF conversation

1. **Stay on Zendesk.** CSAT interception, team familiarity, open API. Build the Claude layer on top, don't migrate.
2. **Stay on RingCentral short-term.** Don't do two migrations at once. Revisit phone stack (Vapi/Twilio/Dialpad) only at the co-pilot/agent phase, or if RC gates API access or reprices.
3. **AI-last, not AI-first, on phones.** Rural customer base → AI only catches calls about to abandon or after-hours. Task-first framing ("I can take your info and have a tech call back within the hour"), no robot announcement, callback promise is the killer feature.
4. **One database, multiple access layers** (Row Level Security) — not separate databases for chatbot vs. internal. Customer chatbot sees only knowledge articles + its own authenticated data; tech co-pilot sees current caller's full record; admin sees everything.
5. **Tables for structured data, vector store for unstructured.** Transcripts/tickets get structured wrappers; guides/manuals get chunked + embedded (pgvector). Images live in object storage with rich text context (caption, step, fault code) — the context is what makes retrieval work.
6. **Epicor: nightly sync + derived warranty fields** (`in_warranty`, `days_remaining`, `expiring_soon`), webhooks for shipments. Read-only. Brendan builds the BAQs; the sync script is mechanical.
7. **Humans stay in control throughout.** Draft-for-human before any auto-reply; promote issue categories to autonomous only after 30+ days of proven accuracy.

## 3. Target architecture

```
                    ┌────────────── SOURCES ──────────────┐
  Zendesk tickets   RingCentral calls    Epicor Kinetic     Docs/guides/website
  (webhook, real    (transcripts,        (BAQ nightly +     (scrape & store,
   time)             API pull)            webhooks)          one-time + weekly)
        │                 │                    │                   │
        ▼                 ▼                    ▼                   ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                    CENTRAL DATABASE ("the brain")               │
  │  Structured tables: customers, machines, tickets, calls,       │
  │  orders, ai_interactions                                        │
  │  Vector store (pgvector): transcripts, guides, manuals,         │
  │  knowledge_articles      Object storage: guide images           │
  └─────────────────────────────────────────────────────────────────┘
        │                 │                    │                   │
        ▼                 ▼                    ▼                   ▼
   Triage layer      Tech co-pilot        Admin/reporting     Customer chatbot
   (classify, route, (live transcript,    (trends, defect     (website; RLS-
   spam kill, draft   diagnoses, caller    patterns, CSAT,     scoped; Phase 4+)
   replies, CSAT      context, whisper)    AI accuracy)
   fast-path)
              All AI actions logged to ai_interactions (audit + accuracy tracking)
```

**Caller-ID lookup chain:** phone number → customer → machines/serials → warranty → ticket & call history → on tech's screen (or whisper) before hello.

## 4. Build phases

### Phase 0 — Data audit (this week, zero build)
Export Zendesk tickets + RC transcripts + queue analytics; gather docs. Load into a Claude Project; analyze top issues, spam %, warranty patterns, abandoned-caller intent. Output: triage categories, schema priorities, and a baseline to measure ROI against.

### Phase 1 — The brain (1–2 weeks of actual work)
Stand up the database (see §5 decision). Four tables first: **customers, machines, tickets, calls**. Seed with Phase 0 exports. Add Epicor nightly sync (BAQs → upsert → derived warranty fields). Then vector-ingest the clean guides/manuals. Deliverable: a queryable knowledge base — "top 5 recurring Crossfire issues in 60 days" gets a real answer.

### Phase 2 — Zendesk triage layer (days, not weeks)
Zendesk webhook → Claude classifies every inbound ticket (spam / solicitation / complaint / quote / technical + model + severity) → tags, routes, prioritizes back into Zendesk via API. Complaints jump the queue with a drafted empathetic reply (human sends) → protects CSAT faster than today. Spam silently handled. Quotes pre-parsed for sales. **Highest ROI-to-effort item in the whole plan.**

### Phase 3 — Phone layer (the big decision point)
Two sub-parts, in order:
1. **Overflow/after-hours catch** — AI answers only calls about to abandon; gathers name/machine/issue; writes structured Zendesk ticket; promises callback. Start after-hours only (zero daytime customer exposure), then expand. Directly attacks the 1,560/month loss.
2. **Tech co-pilot** — live transcript + ranked diagnoses + caller context + "ask Claude" panel; whisper before transfer. Cuts the 9–11 min handle times.
This is where RingCentral's API gates matter → see §6 phone paths.

### Phase 4 — Forced-callback engine
Priority ticket → system auto-dials customer + tech simultaneously, bridges when both answer, escalation chain if tech misses, everything logged to the Zendesk ticket. Replaces the weak voicemail→email→Zendesk link.

### Phase 5 — Autonomous agent (6–12 months of data first)
Confidence-scored: high → auto-reply (only categories explicitly promoted), medium → draft-for-human, low/warranty/safety → human always. Website chatbot on the same brain (RLS-scoped). Opt-in AI phone handling last.

**Every phase delivers standalone value; none blocks on the phone decision until Phase 3.**

## 5. Decision: database home

| | A. Supabase (PDF rec) | B. Railway Postgres (existing pattern) |
|---|---|---|
| Fits current infra | New vendor | Matches pms/kpi/scheduling exactly |
| pgvector | Built in | Install extension |
| Row Level Security | Built in, first-class | Postgres RLS, more manual |
| Image/object storage | Built in (Storage) | Add S3/R2 bucket |
| Non-dev dashboard | Good | Build or use pgAdmin |
| Auth for chatbot later | Built in | Build |
**Lean:** Supabase for this system — the customer-facing chatbot, RLS, and storage needs are exactly what it bundles, and it keeps support data cleanly separated from production/MRP data. Railway Postgres remains fine if consolidating vendors matters more. Either way: company org account, read roles per layer, backups on.

## 6. Decision: phone path (defer to Phase 3)

| Path | What it is | When it wins |
|---|---|---|
| **Stay RC, API layer** | Use RC transcript/API on RX plan | If Conversation Intelligence is on our tier and access is smooth |
| **RC + Vapi in parallel** (PDF lean) | RC keeps all 6 queues/13 agents; Vapi owns overflow + callback lines only, transfers to RC numbers | Best of both; no team disruption; no RC API dependence for the AI features |
| **Full Vapi/Twilio** | Port numbers, own the whole audio stream | Only if going deep on co-pilot + AI agent; requires rebuilding queue/presence/monitoring ops |
| **Dialpad-style buy** | Replace RC with AI-native provider | If we'd rather buy 60% than build 100% |
**Trigger points to leave RC:** transcript API denied/delayed, API repricing, or Phase 3 co-pilot build begins in earnest. Numbers are portable (find account # + PIN now).

## 7. Build-vs-provider note

Zack's project brief allows "going through a provider" instead of self-building. The provider equivalents: Zendesk AI/Fin (triage + replies), Dialpad (phone AI), RC's own AI add-ons. Trade-off: faster start, but each vendor's AI is siloed — none of them share one brain across calls + tickets + Epicor order history, which is where the real leverage is (defect-pattern detection, caller context, one knowledge base). The custom path costs more setup but the database is the moat. A hybrid is legitimate: buy phone AI, build the brain + Zendesk triage.

## 8. Success metrics (baseline from Phase 0)

Abandon rate (50% → target <15%), avg handle time on Crossfire/Apollo (9–11 min → target −30%), first-response time on complaints, % tickets auto-triaged, spam hours recovered, callback promise kept-rate, CSAT trend, AI classification accuracy (from `ai_interactions` corrections).

## 9. Open questions for Brendan/Zack

1. Does our RingCentral RX tier include Conversation Intelligence transcripts, or is it an add-on? (Determines Phase 0 effort and Phase 3 path.)
2. Who owns Zendesk admin, and are custom fields (machine model, category) already in use?
3. Provider vs. build appetite — is there budget preference for Zendesk AI/Dialpad subscriptions vs. dev time?
4. Where do the troubleshooting guides live today, and who can do the quality pass?
5. Supabase (new vendor, batteries included) vs. Railway Postgres (existing pattern) — see §5.
6. What is TITAN's queue doing differently? (Cheapest win available — investigate before building anything.)
