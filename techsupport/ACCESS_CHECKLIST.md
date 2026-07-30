# Tech Support AI — Access & Data Checklist

**Goal:** get every credential and export needed to (a) see all the data we have to work with, and (b) start building. Ordered by priority. Source: TechSupport.pdf conversation + existing workspace infra.

---

## 1. Zendesk (highest priority — the system's backbone)

The PDF conversation firmly concluded: **stay on Zendesk** (CSAT interception, team familiarity, heavy varied volume, open API).

- [ ] **Admin access** to the Zendesk instance (note the subdomain: `______.zendesk.com`)
- [ ] **API token**: Admin Center → Apps & Integrations → APIs → Zendesk API → enable token access → generate token
- [ ] **Bulk ticket export**: Admin Center → Account → Tools → Reports (or API incremental export endpoint). Pull 6–12 months of tickets as JSON/CSV — this is the seed data
- [ ] **CSAT data export** — ratings + comments (critical feature to preserve)
- [ ] Confirm permission to create **Triggers + Webhooks** (needed for the real-time pipeline later)
- [ ] Note: ticket **custom fields** in use (machine model? issue category?) — determines how much Claude must extract vs. what's already structured

**What this unlocks:** the entire ticket history — volume by category, spam %, recurring failures, resolution text (the future knowledge base).

## 2. RingCentral (data extraction — decision on staying comes later)

Conclusion from PDF: **stay short-term**, extract everything, revisit phone stack in Phase 3.

- [ ] **Admin Portal access** confirmed
- [ ] Check **Analytics → Conversation Intelligence** — do call transcripts already exist on our RX tier, or is it a paid add-on? (This is the single biggest unknown.)
- [ ] **Analytics → Performance Reports → Calls** — export call logs (the queue/abandonment data Zack already pulled)
- [ ] **Developer app + API credentials** (developers.ringcentral.com): needed for `/call-log` and AI insights/transcript endpoints to bulk-pull ~300 recent transcripts
- [ ] Locate **account number + PIN** (needed if we ever port numbers; find now, don't wait)
- [ ] Export the **queue → agent mapping** (6 queues, 13 agents) for routing design

**What this unlocks:** real call transcripts = the raw material for the knowledge base, plus hard numbers on the 50% abandon problem.

## 3. Epicor Kinetic (cloud) — order/warranty context

Already strong here: Kinetic cloud, admin access, existing BAQ→REST→Postgres pattern in the `scheduling/` MRP service. Reuse it.

- [ ] **Read-only API key**: Security → API Keys → generate (scope read-only; separate key from the MRP's)
- [ ] Confirm company ID + Kinetic cloud URL (already known from MRP work)
- [ ] Spec the support-side BAQs (can largely mirror MRP ones):
  - Customer master (name, company, phone, email — phone is the lookup key for caller ID)
  - Shipped machines / serials (model, serial, ship date, customer)
  - Warranty records (serial, start, end, type)
  - Orders + order lines modified in last 24h (nightly sync)
- [ ] Check **Kinetic webhooks** availability for real-time shipment/registration events (Phase 2+ refinement)

## 4. Anthropic API

- [ ] **Company Anthropic org** + API key (console.anthropic.com) — for ticket classification, transcript enrichment, and the eventual co-pilot/agent. Not a personal account.

## 5. Database home (decision needed — see Framework doc)

- [ ] **Option A (PDF rec): Supabase org account** under company email — pgvector, Row Level Security, Storage for guide images, dashboard for non-devs
- [ ] **Option B (existing pattern): Railway Postgres** — matches pms/kpi/scheduling infra; pgvector installable; you own the whole stack but build RLS/storage layers yourself
- Either way: company-owned org, role-based access, daily backups. *Not a personal account* — per Zack's explicit requirement.

## 6. Knowledge content inventory (no credentials, just gathering)

- [ ] Locate all: troubleshooting guides (Word/PDF), fault-code lists, product manuals, internal knowledge articles, screenshots of guides
- [ ] Note which are current vs. outdated (quality pass before ingestion — garbage in, garbage out)
- [ ] Website URLs for scrape-and-store: product pages, FAQ, published troubleshooting guides
- [ ] Flag image-heavy guides — images need captions/headings for retrieval to work

## 7. Later / optional (don't get accounts yet)

- Vapi / Twilio / Bland / Dialpad — Phase 3 phone decision; demo calls only for now
- Make.com — only if choosing the no-code pipeline over a small Railway service
- Firecrawl or similar — for automated website scraping in Phase 1

---

## Day-one "see the data" plan (no build required)

1. Export 6–12 months of Zendesk tickets (CSV/JSON)
2. Pull last ~300 RingCentral transcripts (portal or API)
3. Export RingCentral queue analytics (the abandonment report)
4. Gather the docs/guides inventory into one folder
5. Load all of it into a Claude Project → run the analysis questions: top recurring issues by model, spam/solicitation %, warranty mention rate, resolution patterns, what the 1,560 abandoned callers likely needed

This Phase 0 costs nothing, needs no developer, and directly shapes the database schema and triage categories.
