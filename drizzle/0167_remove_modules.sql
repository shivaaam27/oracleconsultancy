-- Five modules removed, and their tables with them.
--
-- The owner asked for COS to go back to being the task-management system it
-- was, and to drop the data rather than keep it unreachable (21 Sept 2026). He
-- was shown the row counts first — 4,183 in Orders & Imports and 779 in
-- Capital projects were real business records — and asked for them to go
-- anyway, with no backup taken here.
--
-- ⚠️ THIS IS NOT REVERSIBLE FROM THE REPOSITORY. `git revert` brings the
-- screens back; it does not bring the rows back. Supabase's own point-in-time
-- backups are the only route to the data after this runs.
--
-- ⚠️ CASCADE IS SAFE HERE, AND THAT WAS CHECKED RATHER THAN ASSUMED: before
-- writing this, every foreign key in the database was read, and NOTHING that
-- is being kept points into any of these 72 tables. The 62 keys that do exist
-- run the other way — out of these tables into companies and people — so they
-- go with the tables that hold them. `vendors` is deliberately untouched: it is
-- the shared supplier register that Assets & Vendors owns, which CocoZuri
-- merely read from.


-- CocoZuri Operations (29 tables)
DROP TABLE IF EXISTS "cz_batches" CASCADE;
DROP TABLE IF EXISTS "cz_branches" CASCADE;
DROP TABLE IF EXISTS "cz_budgets" CASCADE;
DROP TABLE IF EXISTS "cz_counter_sale_lines" CASCADE;
DROP TABLE IF EXISTS "cz_counter_sales" CASCADE;
DROP TABLE IF EXISTS "cz_customers" CASCADE;
DROP TABLE IF EXISTS "cz_invoice_line_lots" CASCADE;
DROP TABLE IF EXISTS "cz_invoice_lines" CASCADE;
DROP TABLE IF EXISTS "cz_invoices" CASCADE;
DROP TABLE IF EXISTS "cz_lists" CASCADE;
DROP TABLE IF EXISTS "cz_payments" CASCADE;
DROP TABLE IF EXISTS "cz_prices" CASCADE;
DROP TABLE IF EXISTS "cz_production_plan_lines" CASCADE;
DROP TABLE IF EXISTS "cz_production_plans" CASCADE;
DROP TABLE IF EXISTS "cz_products" CASCADE;
DROP TABLE IF EXISTS "cz_purchase_lines" CASCADE;
DROP TABLE IF EXISTS "cz_purchases" CASCADE;
DROP TABLE IF EXISTS "cz_receipts" CASCADE;
DROP TABLE IF EXISTS "cz_recipe_lines" CASCADE;
DROP TABLE IF EXISTS "cz_recipes" CASCADE;
DROP TABLE IF EXISTS "cz_return_lines" CASCADE;
DROP TABLE IF EXISTS "cz_returns" CASCADE;
DROP TABLE IF EXISTS "cz_stock_counts" CASCADE;
DROP TABLE IF EXISTS "cz_stock_days" CASCADE;
DROP TABLE IF EXISTS "cz_stock_items" CASCADE;
DROP TABLE IF EXISTS "cz_stock_locations" CASCADE;
DROP TABLE IF EXISTS "cz_stock_moves" CASCADE;
DROP TABLE IF EXISTS "cz_transfer_lines" CASCADE;
DROP TABLE IF EXISTS "cz_transfers" CASCADE;

-- Marketing (10 tables)
DROP TABLE IF EXISTS "mkt_accounts" CASCADE;
DROP TABLE IF EXISTS "mkt_assets" CASCADE;
DROP TABLE IF EXISTS "mkt_campaigns" CASCADE;
DROP TABLE IF EXISTS "mkt_clients" CASCADE;
DROP TABLE IF EXISTS "mkt_post_assets" CASCADE;
DROP TABLE IF EXISTS "mkt_posts" CASCADE;
DROP TABLE IF EXISTS "mkt_publications" CASCADE;
DROP TABLE IF EXISTS "mkt_results" CASCADE;
DROP TABLE IF EXISTS "mkt_shoots" CASCADE;
DROP TABLE IF EXISTS "mkt_spend" CASCADE;

-- Recruitment (7 tables)
DROP TABLE IF EXISTS "rec_candidates" CASCADE;
DROP TABLE IF EXISTS "rec_checkins" CASCADE;
DROP TABLE IF EXISTS "rec_clients" CASCADE;
DROP TABLE IF EXISTS "rec_interviews" CASCADE;
DROP TABLE IF EXISTS "rec_job_orders" CASCADE;
DROP TABLE IF EXISTS "rec_placements" CASCADE;
DROP TABLE IF EXISTS "rec_shortlist" CASCADE;

-- Orders & Imports (PES trading) (8 tables)
DROP TABLE IF EXISTS "ops_audit" CASCADE;
DROP TABLE IF EXISTS "ops_enquiries" CASCADE;
DROP TABLE IF EXISTS "ops_invoices" CASCADE;
DROP TABLE IF EXISTS "ops_order_lines" CASCADE;
DROP TABLE IF EXISTS "ops_payments" CASCADE;
DROP TABLE IF EXISTS "ops_refs" CASCADE;
DROP TABLE IF EXISTS "ops_shipments" CASCADE;
DROP TABLE IF EXISTS "ops_tenders" CASCADE;

-- Capital projects (10 tables)
DROP TABLE IF EXISTS "project_audit" CASCADE;
DROP TABLE IF EXISTS "project_budget_lines" CASCADE;
DROP TABLE IF EXISTS "project_expenditures" CASCADE;
DROP TABLE IF EXISTS "project_payment_stages" CASCADE;
DROP TABLE IF EXISTS "project_payments" CASCADE;
DROP TABLE IF EXISTS "project_refs" CASCADE;
DROP TABLE IF EXISTS "project_requisitions" CASCADE;
DROP TABLE IF EXISTS "project_site_days" CASCADE;
DROP TABLE IF EXISTS "project_site_people" CASCADE;
DROP TABLE IF EXISTS "projects" CASCADE;

-- The general ledger (8 tables)
DROP TABLE IF EXISTS "bank_rec_lines" CASCADE;
DROP TABLE IF EXISTS "bank_recs" CASCADE;
DROP TABLE IF EXISTS "fixed_assets" CASCADE;
DROP TABLE IF EXISTS "gl_accounts" CASCADE;
DROP TABLE IF EXISTS "gl_entries" CASCADE;
DROP TABLE IF EXISTS "journal_entries" CASCADE;
DROP TABLE IF EXISTS "journal_entry_lines" CASCADE;
DROP TABLE IF EXISTS "tax_rates" CASCADE;
