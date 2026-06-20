# FULL ERP BUILD CHECKLIST — Scored Against COS System (No-AI Baseline)

> Owner-supplied 246-item ERP map (all buildable with zero AI). Scored against the live
> COS system as of 2026-06-20. This is the **map, not the order** — sequencing is at the end.
> Status key: ✅ built · 🟡 partial · ❌ not built. Companion to [build_checklist_baseline.md].
> Context: pre-ERP audit already ran (see [audit_pre_erp_jun2026] + [phase0_hardening_jun2026]);
> verdict = solid CoS command-centre, NOT yet a finance ERP, fixable without rewrite.

## 1. CORE DATA & MASTER RECORDS
1. Company/entity master — ✅ companies (7+ entities, branding cols).
2. Customer master — ❌.
3. Supplier/vendor master — ✅ vendors.
4. Product/item master — 🟡 stock_items (OECR consumables) only; no general product master.
5. Service master — ❌.
6. Employee master — ✅ people (rich HR profile).
7. Chart of accounts — ❌ (no accounting).
8. Cost centre master — ❌.
9. Department master — ✅ departments.
10. Location/warehouse master — 🟡 sites (where staff live/work, NOT warehouses).
11. Currency master — ❌ (TZS implicit).
12. Tax code master — ❌ (Tax & Legal tracks obligations, not tax codes).
13. Unit-of-measure master — ❌.
14. Payment terms master — ❌.
15. Bank account master — 🟡 bank facts in fact ledger; no structured master.
16. Asset master — ✅ assets.
17. Project master — ❌ (tasks exist, no projects).
18. Unique ID scheme across masters — 🟡 tasks/staff only (see baseline #2).
19. Master data validation — 🟡 per-form.
20. Master data dedup — 🟡 docs/people; not all masters.
21. Master data archiving — ✅ archive + lifecycle everywhere.

## 2. FINANCE & ACCOUNTING — ❌ essentially none (board pack/wages REMOVED Jun 2026)
22–46. GL, journals, double-entry engine, AP, AR, bank rec, cash, petty cash, fixed-asset
accounting, depreciation, multi-currency, tax engine, tax reporting, trial balance, balance
sheet, P&L, cash flow, period/year close, budgeting, budget-vs-actual, inter-company txns +
recon, cost allocation, immutable financial audit — **❌ ALL not built.**
- Foundations PARTLY prepped for this (Phase 0): money→numeric(14,2), `withTx` on hot paths,
  `number_series` numbering. These are the prerequisites flagged in the pre-ERP audit (txn
  atomicity, money precision, sequence numbering) — the GL itself is the next big build.

## 3. PROCUREMENT / PURCHASING — ❌ none
47–57. Requisition, approval, RFQ, quote comparison, PO, PO approval, GRN, 3-way match,
supplier payment, supplier performance, procurement budget — **❌ all not built.**

## 4. INVENTORY / STOCK — 🟡 only OECR consumables
58. Stock item tracking — 🟡 stock_items.
59. Stock-in — 🟡 stock_purchases.
60. Stock-out — 🟡 stock_issues.
61–73. Transfers, adjustments, valuation (FIFO/avg), reorder levels, auto-reorder, batch/lot,
serial, expiry, stock-take, reconciliation, multi-warehouse, bin mgmt, barcode/QR — **❌.**

## 5. SALES & DISTRIBUTION — ❌ none
74–85. Quotation, sales order, approval, delivery note, invoicing, credit notes, pricing,
discounts, credit limits, statements, commission, POS (Cocozuri) — **❌ all not built.**

## 6. CRM — ❌ none
86–93. Leads, pipeline, opportunities, contacts, interaction history, quote→order, follow-up,
segmentation — **❌.** (Note: `pipeline` table exists but = bureaucracy/permits, NOT sales CRM.)

## 7. HR & PAYROLL — ✅ strong on HR, ❌ on payroll
94. Employee records — ✅.
95. Contract tracking — 🟡 documents/facts (contract docs); no contract entity.
96. Contract expiry alerts — ✅ (doc expiry + obligations).
97. Attendance — ✅ (admin register + portal self-check-in).
98. Leave management — ✅ (ELR-accurate).
99. Leave balance calc — ✅.
100. Leave approval workflow — ✅.
101. Shift/roster scheduling — ❌.
102. Payroll calc engine — ❌ (REMOVED Jun 2026).
103. Salary structure — ❌ (wage fields removed).
104. Statutory deductions (PAYE/NSSF) — ❌ (ELR rules kept as reference only).
105. Payslip generation — ❌.
106. Loan/advance tracking — ❌.
107. Performance/KPI — 🟡 probation/review tasks; no KPI module.
108. Training records — ❌.
109. Disciplinary records — ❌.
110. Recruitment/onboarding — ✅ onboarding/offboarding journeys (todos kind).
111. Document expiry per employee — ✅ (requirement profiles + compliance).

## 8. PROJECT / TASK MANAGEMENT — ✅ tasks strong, ❌ projects
112. Project creation — ❌.
113. Task breakdown — 🟡 tasks + meeting tasks; no sub-task tree.
114. Task assignment — ✅ task_assignees.
115. Task dependencies — ❌.
116. Deadlines & reminders — ✅.
117. Time tracking/timesheets — ❌.
118. Project budgeting — ❌.
119. Project cost tracking — ❌.
120. Milestone tracking — ❌.
121. Resource allocation — 🟡 org/reporting; not project resourcing.

## 9. DOCUMENT MANAGEMENT — ✅ this is the system's strongest area
122. Upload — ✅. 123. Metadata tagging — ✅. 124. Categorization rules — ✅.
125. Version control — ✅ (supersede/renewal/lifecycle). 126. Doc→record linking — ✅.
127. Expiry + auto-task — ✅. 128. Document permissions — ❌ (gap). 129. Search/filter — ✅.
130. Audit trail on documents — ✅.

## 10. MANUFACTURING / PRODUCTION — ❌ none
131–137. BOM, production orders, raw-material consumption, finished goods, scheduling, QC,
wastage — **❌ all not built.** (Dar Spices/Cocozuri/Terra Green produce — future relevance.)

## 11. WORKFLOW & APPROVALS — 🟡 leave only, no general engine
138–144. Configurable chains, multi-level, delegation, notifications, approval audit log,
escalation, conditional routing — 🟡 **leave approvals + portal approvals cockpit exist;
no configurable multi-level approval engine.**

## 12. AUTOMATION ENGINE — ✅ strong (this is a built strength)
145. Trigger/rules engine — ✅ automation-reactions. 146. Scheduled jobs — ✅ crons/morning-run.
147. Recurring txn generator — ✅ obligations auto-spawn. 148. Auto-notifications — ✅.
149. Auto-status updates — ✅. 150. Event-driven actions — ✅ index-hooks + reaction chains.

## 13. NOTIFICATIONS — 🟡 in-app strong, external channels weak
151. Email — 🟡 (send-as-director blocked, Resend planned).
152. WhatsApp — ❌. 153. Telegram — ❌ (planned). 154. In-app — ✅. 155. SMS — ❌.
156. Per-user preferences — 🟡 quiet hours/digest. 157. Notification log — 🟡 partial.

## 14. REPORTING & ANALYTICS — 🟡 some dashboards, no builder/export breadth
158. Financial reports — ❌ (no finance). 159. Inventory reports — 🟡 OECR only.
160. Sales reports — ❌. 161. HR reports — ✅ (Brief HR section). 162. Procurement — ❌.
163. Custom report builder — ❌. 164. Dashboards per role — 🟡 home/brief/portal.
165. KPI dashboards — 🟡 Insights. 166. Drill-down — ✅ ("every number a door").
167. Scheduled reports — 🟡 Brief digest. 168. Export Excel/PDF/CSV — 🟡 PDF only.
169. Filtering/grouping — ✅.

## 15. USERS, ROLES & SECURITY — 🟡 auth strong, RBAC shallow
170. Auth — ✅. 171. Password hashing & policy — 🟡 scrypt, no policy. 172. MFA — 🟡 owner
identity 2nd factor + passkeys (not classic TOTP MFA). 173. Sessions — ✅. 174. RBAC — 🟡
owner/staff/manager/director. 175. Permission matrix per module — ❌. 176. Per-record perms —
🟡 portal ownership scope. 177. Field-level perms — ❌. 178. User activity logging — 🟡.
179. Login/access logs — 🟡. 180. Account lockout — ❌. 181. Password reset — 🟡 self-service.
182. API key/secret mgmt — ✅. 183. Encryption at rest — ✅ (Supabase managed).
184. Encryption in transit — ✅ HTTPS. 185. Login vault — ✅.

## 16. AUDIT, COMPLIANCE & GOVERNANCE — 🟡 good audit, no immutable finance
186. Full audit trail — 🟡 (strong but not every table). 187. Immutable financial logs — ❌
(no finance yet — flagged as a brutal-to-retrofit foundation). 188. Master-data change history
— 🟡 person/facts. 189. Compliance tracking — ✅ (licenses/permits/filings, requirements).
190. Regulatory deadline alerts — ✅ (Tax & Legal obligations). 191. Data retention — ❌.
192. Data privacy controls — ❌.

## 17. SYSTEM ARCHITECTURE — ✅ mostly solid
193. Frontend — ✅. 194. Backend — ✅. 195. DB — ✅. 196. Modular — ✅. 197. Internal APIs — ✅.
198. Data flow defined — ✅. 199. Env separation (test vs live) — ❌ (no separate test env —
owner flagged this; cleanup-and-reset parked). 200. Config not hardcoded — ✅ (settings table).
201. Multi-entity architecture — ✅ (7 companies, prefix-scoped) — **the foundation to protect.**
202. Multi-currency architecture — ❌. 203. Scalability planning — 🟡.

## 18. DATA MANAGEMENT — 🟡
204. Validation everywhere — 🟡. 205. Bulk import — 🟡 (intake/bulk upload; no master CSV import).
206. Export tools — 🟡 PDF only. 207. Migration tools — 🟡 (intake/backfill scripts).
208. Cleansing/dedup — ✅ (docs/people). 209. Integrity constraints — 🟡 (Phase 0 added FKs/
withTx; pre-ERP audit flagged gaps). 210. Referential integrity — 🟡 **(audit flagged supabase-js
HTTP client has no txns across ~167 files — the foundation to fix before GL).**

## 19. RELIABILITY & OPERATIONS — 🟡
211. Scheduled backups — 🟡 (Supabase cloud; local manual). 212. Restore tested — ✅.
213. DR plan — 🟡 (BACKUP.md). 214. Graceful failure — ✅. 215. Error logging/monitoring — ✅
Sentry. 216. System health monitoring — ✅ (self-repair + status card). 217. Uptime monitoring
— 🟡 (Vercel/Supabase). 218. Performance monitoring — ❌ (Sentry errors-only, no perf tracing).
219. Rate limiting — ❌. 220. DB indexing — ✅ (0075). 221. Caching — ✅ (React cache()).

## 20. INTEGRATION — ❌ almost none
222. Payment gateway (M-Pesa/Tigo) — ❌. 223. Bank integration — ❌. 224. Email server — 🟡
(SMTP/Resend partial). 225. Messaging API (Telegram/WhatsApp) — ❌ (Telegram planned).
226. Gov/tax portal — ❌. 227. Excel/Sheets import-export — ❌ (Dropbox connector planned).
228. Webhooks — 🟡 (Supabase Realtime; Dropbox webhook planned). 229. Third-party API — ❌.

## 21. CONFIGURATION & ADMIN — 🟡
230. Settings panel — ✅. 231. Company config — ✅ (branding/letterhead). 232. Tax/currency
config — ❌. 233. Numbering sequence config — 🟡 (number_series exists; not user-configurable).
234. Workflow config — ❌. 235. User/role admin — 🟡 (portal access mgmt in Settings).
236. Master data admin — ✅ (Companies hub reference tabs). 237. Audit log viewer — 🟡.
238. Backup management panel — ❌ (CLI only).

## 22. USABILITY — ✅ strong (Aurora design system)
239. Clean forms — ✅. 240. Search everywhere — ✅ (ORI brain, Ctrl+Space). 241. Bulk actions —
✅. 242. Mobile responsive — ✅. 243. Light/dark theming — ✅. 244. Multi-language readiness —
🟡 (voice in 4 langs; UI English). 245. Help/docs — 🟡 (memory/*; onboarding tours planned).
246. User onboarding flows — 🟡 (journeys built; in-app tours planned).

---

## Scorecard by domain (rough)
- **Strong (✅):** Document management (9), Automation engine (12), Usability (22), HR-minus-payroll
  (7), Tasks (8 partial), Multi-entity architecture, Compliance/obligations, Security-auth.
- **Partial (🟡):** Masters (1), Inventory (consumables only), Reporting, RBAC depth, Notifications,
  Data integrity, Reliability ops, Config/admin.
- **Absent (❌):** **Finance/accounting (2)**, Procurement (3), Sales (5), CRM (6), Payroll,
  Manufacturing (10), Integrations (20, esp. payments/bank), multi-currency, test environment.

## Owner's two cautions (recorded)
1. **Don't build all 246 at once** — this is the map, not the order.
2. **The hardest parts are invisible foundations** — double-entry engine (44–46), referential
   integrity (210), audit immutability (187), multi-entity architecture (201). Get these right
   early; brutal to retrofit. (Multi-entity = ✅ already; the other three are the priority.)

## Suggested sequence (finance + masters + security first)
1. **Foundations** (already partly done): txn atomicity, money precision, numbering, referential
   integrity — finish before any ledger. (Phase 0 started this.)
2. **Master data**: customer, product/item, CoA, currency, tax codes, UoM, payment terms, bank.
3. **Finance core**: GL + double-entry + journals + AP/AR + trial balance/P&L/BS, immutable audit.
4. **Lean on existing strengths**: docs/tasks/HR/automation already there.
5. **Then** Sales+Inventory (→ Cocozuri POS), Procurement, then Payroll, CRM, Manufacturing.
6. **Cross-cutting throughout**: approval engine, RBAC/permission matrix, Excel/CSV export,
   external integrations (M-Pesa/bank/Telegram), test environment.
