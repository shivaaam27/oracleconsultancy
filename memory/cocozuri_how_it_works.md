---
name: cocozuri-how-it-works
description: "CocoZuri end to end in plain English — every screen in the order the work happens, what each one refuses and why. Written for the owner, 23 Aug 2026."
metadata:
  type: project
---

# CocoZuri, end to end

Written for the owner, in plain English, 23 Aug 2026 — he asked what actually
happens across the module, in order, without anything left out.

⚠️ **This is the "what and why" document.** The stage-by-stage build record with
every trap is `memory/cocozuri_manufacturing_plan.md` (§6a–§6j); the earlier
selling half is `memory/cocozuri_ops_plan.md`. **If those and this ever
disagree, they are the authority and this is out of date.**

⚠️ **The sidebar follows this order.** `MODULES` in `src/lib/nav.ts` groups the
CocoZuri rail as *Start · 1 Set up · 2 Buy · 3 Make · 4 Keep · 5 Sell · 6 Get
paid · 7 Pay out · 8 Put right · 9 Know* — the order the work happens in, not the
order the screens were built. **Adding a page? Put it where it happens in the
day, not at the end.**

---

## The front page — `/cocozuri`

Tiles, and every one is a door: products, customers, prices, invoices, what is
owed, stock items, purchases waiting to be approved, recipes that cannot be
costed, batches still open, transfers nobody has counted, returns still on the
bench. Under them the money owed split into the five ageing bands, and a line
saying how many documents are waiting to go into the books.

⚠️ **Every figure is worked out when the page opens.** Nothing in this module is
stored as a total — no balance column, no cost column, no profit column. That is
why nothing here can go stale, and it is the rule to defend first.

---

## 1 · Set up

### Products — `/cocozuri/products`

The catalogue, 127 chocolates.

⚠️ **A price is a ROW WITH A DATE, never a column on the product.** The one in
force is the newest whose date has arrived, worked out on read — which is what
stops a price rise rewriting what was charged last month. A customer's own agreed
price beats the standard list.

⚠️ **There are real duplicates** — one bar imported as five rows because it is
typed five ways in the spreadsheets. Deliberate: merging is a business decision,
not a string comparison. The **merge tool** lives on this page.

### Customers — `/cocozuri/customers`

The 14 supermarkets and their branches. Each carries its own VAT rate, payment
terms, currency and invoice series, and those are what an invoice freezes.

---

## 2 · Buy

### Budgets — `/cocozuri/budgets`

A pot of money for a period and a place.

⚠️ **A budget is approved by a NAMED PERSON at a MOMENT** — the owner asked for
this specifically. The name is stored beside the id, because a person may leave
and the decision still happened. A budget nobody has approved cannot be charged
to, and an approved one is not edited — you reopen it, which clears the approval.

⚠️ **Going over is refused until somebody says so.** Not because overspending is
impossible — the flour was bought — but because it has to be a decision somebody
makes rather than a number that quietly appears.

### Purchases — `/cocozuri/purchases`

⚠️ **THE SUPPLIER IS OPTIONAL AND MUST STAY OPTIONAL.** Raw materials are often
bought at random or self-bought; a form demanding a supplier will not be filled
in, and a purchase nobody records never reaches the books at all. "Not named" is
shown as a plain fact, never as a warning.

**Four ways of paying, and they behave differently:** on account (the supplier is
owed), cash, bank, and **somebody's own money** — which means that person is owed
it back, so the books credit **them**, never the supplier.

⚠️ **FREIGHT IS SPREAD ACROSS THE GOODS BY VALUE AND GOES INTO THE STOCK, NOT
INTO AN EXPENSE.** Booking it to carriage makes the almonds look cheaper than
they were and every batch costed from them wrong the same way. Proved: cocoa
bought at 1,000 costs **1,038.46** once its transit rides on it.

⚠️ **APPROVING IS WHAT MAKES IT COUNT.** A draft moves no stock and posts
nothing — safe to type while the delivery is still coming through the door.
Approving writes the stock in at landed cost and creates a **lot** for any line
where an expiry was typed.

⚠️ **A rated purchase where nobody has said whether the price includes the VAT
cannot be approved or posted.** The same 1,180,000 is either +VAT or
includes-VAT, and the difference is real money.

---

## 3 · Make

### Order form — `/cocozuri/order`

What to make next, worked out from what actually went out.

⚠️ **It divides by the days ACTUALLY COUNTED, not the calendar.** The kitchen
skips days; dividing by 30 would halve every figure. Fewer than two days of
history gets no figure at all.

### Recipes — `/cocozuri/recipes`

⚠️ **NO COST COLUMN, EVER.** A recipe costs itself from what the materials really
cost — the landed figure — so nobody edits anything when cocoa goes up.

⚠️ **A material nobody has bought has NO cost, and it is SAID.** Shown as **"≥"**
with the material named, never a silent zero: a total with a zero hidden in it
reads as cheap.

⚠️ **Cost per unit divides by the GOOD units.** A 10% expected loss on 120 means
the 108 survivors carry the cost of all 120. Dividing by the yield understates
every bar by exactly the loss.

The material cost is a **weighted average** of what actually arrived, not the
latest price — one emergency bag would otherwise rewrite every recipe.

### Production — `/cocozuri/batches`

⚠️ **SHAPED ENTIRELY BY "we don't use batch numbers, but we are introducing
them".** It does not fail by being wrong, it fails by not being used. So: the
number is **allocated, never typed**, a batch **opens in one action**, the recipe
is **optional**, and every question is asked at **close**.

⚠️ **MATERIALS ARE CONSUMED AT CLOSE, NOT AT START** — so the kitchen's shelf
reads true all day and, more importantly, **abandoning a batch costs nothing**,
so nobody avoids opening one.

Closing does four things at once:

1. takes the materials, **oldest-expiring lot first**;
2. puts the bars on the shelf;
3. works out the **expiry** — the earlier of the shelf life and the soonest
   ingredient — and freezes it;
4. runs the **inter check**: what came out against what should have.

⚠️ **THE INTER CHECK READS THE MOVEMENTS, NOT THE RECIPE.** The recipe is what
was *meant* to go in; reading it back as fact would make every batch agree with
itself. A shortfall must say **where it went and why** — naming the kind is not
enough.

---

## 4 · Keep

### Stock book — `/cocozuri/stock`

The daily sheet as somebody types it. Four sheets, and each heads its third
column with a different word: the shop **RETURN**, the kitchen **DA/SA/TA**, raw
materials **DAMAGE**. ⚠️ Stored under its own name — nobody has explained DA/SA/TA
and it is never translated into a guess.

⚠️ **A COUNT IS THE POSITION AT THE END OF ITS DATE**, so an opening stock is
dated the day *before* the book starts. Out by a day here and every figure after
a stock-take is wrong by that day's trade.

⚠️ **A count becomes the new truth**; everything after it carries forward from
what was counted. **A variance must be explained.** **A row of three zeros is
deleted, not stored** — "nothing moved" and "nobody wrote anything down" are
different claims.

⚠️ **The "other" column is READ-ONLY.** It is the net of movements recorded on a
document, shown rather than hidden — otherwise the grid would print a closing
figure that appears not to add up. Retyping a delivery there would move the same
stock twice.

### Month end — `/cocozuri/stock/month`

The month's block and the stock-take.

### Transfers — `/cocozuri/transfers`

⚠️ **A TRANSFER HAS TWO MOMENTS.** Sending takes it off the kitchen shelf — it is
now *in transit*, on neither shelf, which is the truth. Receiving puts on what
**actually arrived**. Recording one figure at both ends is exactly what made the
shop's opening stock a mystery.

⚠️ **The missing units get NO movement of their own.** They belong to neither
shelf; both sides carry the transfer's reference, so the loss is always
answerable. Inventing a third movement to tidy the arithmetic would put them
somewhere they never were.

⚠️ **The shop's `AMBER RABDI` and the kitchen's are the same chocolate but TWO
ROWS**, joined by **`product_id`, never by name**. Matching by name is what loses
the workbook 200 units a month.

**It refuses:** a place sending to itself, two rows that are not the same
product, an unexplained shortfall, **more arriving than was sent**, and
cancelling one that has already arrived.

---

## 5 · Sell

### The counter — `/cocozuri/counter`

⚠️ **A RECORD OF A SALE, NOT A TILL.** The owner settled it: *"cash taken and
kept in drawer and informed via WhatsApp... some data sheets... some cash
collected via online modes... **for now we won't integrate a payment system here,
just reports get digital**."*

Nothing takes payment. Write down what was sold, off which counter, and how the
money came in; the chocolate comes off the shelf and the day's takings split into
**what should be in the drawer** and **what came in by phone**.

⚠️ **The KITCHEN is the main counter**, not the shop — the kitchen takes the bulk
and custom orders, the shop the rare walk-in. The form defaults to the kitchen.

⚠️ **Recording it a day late is normal** — that is what "informed via WhatsApp"
means, so who sold it and who typed it are both kept. **A future date is
refused**: it would leave the sale out of today's takings and the shelf unchanged
until that date arrived.

A walk-in needs no account, the price is suggested and then typeable (bulk and
custom orders are agreed on the spot), a NIL price is allowed and a missing one
is not, and **a negative is refused — something coming back is a return**.

### Invoices — `/cocozuri/invoices`

Pick a customer and the VAT rate, terms and currency resolve; pick a product and
the price fills itself in. **The amount in words is generated**, not typed.

⚠️ **FOUR THINGS FREEZE when an invoice is raised**: the customer details, the
VAT rate, the terms, and each line's description. An invoice prints what was true
the day it was raised.

⚠️ **AN ISSUED INVOICE IS NEVER EDITED** — it is answered with a credit note,
which is the same record with its own numbering.

⚠️ **VAT IS THE AMOUNT *CONTAINED* IN THE PRICE, NOT A PERCENTAGE ON TOP.** The
spreadsheets did it the other way and **overstated VAT by TZS 532,296 across 129
of 140 invoices**. Never copy that.

---

## 6 · Get paid

### Money in — `/cocozuri/receipts`

⚠️ **THE CUSTOMER COMES OFF THE INVOICE, NEVER THE FORM.** A receipt for one
customer against another's invoice is not a thing that should be typeable.

⚠️ **One cheque covering four invoices is FOUR ROWS sharing a date and a
reference, all or nothing** — so nothing ever sits "on account" waiting to be
allocated. An overpayment is recorded as it stands and shown negative.

⚠️ **Only ISSUED documents are owed.** A draft has not been sent to anybody.

### Owed — `/cocozuri/owed`

Worst first. ⚠️ **FIVE AGEING BANDS, and they must stay five.** The spreadsheet's
`Sheet2` jumps 31–60 straight to 91+, so everything **61–90 days late is reported
a month young** — TZS 1,567,000 of it on the day the books were read.

### Statements — `/cocozuri/statements`

Printable, period in the address, so one can be bookmarked and sent.

---

## 7 · Pay out

### Money out — `/cocozuri/payments`

⚠️ **ONLY "on account" AND "own money" LEAVE ANYTHING OWED.** A purchase paid
from the bank or the cash box was settled the day it was bought; paying it again
would credit the bank twice.

⚠️ **The party is the one the purchase credited** — pay a **person** back, not a
supplier, when they bought it themselves.

One payment across several purchases is one row each, all or nothing; an
overpayment shows negative; a posted payment cannot be deleted, only reversed.

---

## 8 · Put right

### Returns & damage — `/cocozuri/returns`

⚠️ **ONE DOCUMENT, TWO DOORS.** A customer's return comes **back onto** the shelf
(it left the books the day it was sold); breakage found in-house **never went
anywhere**, so nothing moves until it is thrown.

⚠️ **What is left over — came back, not yet judged — is chocolate ON A BENCH
BEING REPACKED**: neither sellable nor written off. That is the state nobody can
see today, and it can be sorted in more than one go.

The money side is a **credit note**, priced off the **ORIGINAL invoice**, never
today's list, and matched by `product_id`.

⚠️ **Throwing something away posts Dr stock written off · Cr stock, AT WHAT IT
COST** — never at what it would have sold for. A loss that cannot be valued in
full is **refused by name** rather than posted short.

⚠️ **A sales return does NOT put the cost back separately** — it does not need
to. Goods coming back are a positive movement, so they reduce the month's cost of
sales by themselves.

---

## 9 · Know

### Profit — `/cocozuri/profit`

Per batch, per customer, per month.

⚠️ **WHAT A BATCH EARNED CANNOT BE KNOWN, AND THE PAGE SAYS SO.** An invoice line
names a **product**, not a **batch**. What it shows is what the batch **cost** and
what its bars are **worth** at the price they sell for. Tracing a sale to a batch
is what Stage 9 would need extending to do.

⚠️ **Margins are taken NET OF VAT.** Costs are ex-VAT and a CocoZuri invoice is
VAT-inclusive; comparing them straight inflates every margin by the rate.

⚠️ **An incomplete cost makes profit a CEILING, not a floor** — the opposite of
everywhere else — so it shows **"≤"**. Today **113 chocolates have never been
costed**, so most figures are still bounds. That is a data gap, not a code one.

⚠️ **The tiles cost what actually LEFT THE SHELF; the per-customer table costs
each INVOICE LINE.** They will not agree while the shelf and the invoices
disagree — and that gap is worth more than either number. Said on the page.

### Trace — `/cocozuri/trace`

The recall screen. From a batch: **what went in** and **where it went**. From a
bag of almonds: **exactly what was made from it, and nothing else**. Plus what is
going off soonest, with **what carries no date at all counted separately** — the
finding that matters most in a food business.

⚠️ **First expired, first out — not first in.** A bag bought later can go off
sooner, and taking the older one leaves the one about to expire sitting there
until it does.

---

## Into the books

⚠️ **Nothing lands in the accounts silently.** Somebody presses Post, and every
posting is reversible.

| What | Becomes |
|---|---|
| Invoice | Dr debtors *gross* · Cr Sales *net* · Cr VAT |
| Credit note | the same voucher with the **sides swapped** — never a negative |
| Money in | Dr bank/cash · Cr debtors |
| Counter sale | Dr cash/bank · Cr Sales · Cr VAT — **no debtor** |
| Purchase | Dr stock *(landed)* · Cr creditors, bank or cash |
| Money out | Dr creditors *(supplier or person)* · Cr bank/cash |
| Written off | Dr 6930 stock written off · Cr 1150 stock |
| Cost of sales | Dr 5100 · Cr 1150, one voucher a month |
| Stock-take | Dr/Cr 6940 stock gains and losses |
| Depreciation | Dr 6600 · Cr 1220, one voucher a month |

⚠️ **VAT IS NEVER INCOME** — the sales line is the NET.
⚠️ **A payment received into another company's account is REFUSED.** The "in DSC"
question is unanswered and posting it would be a lie in two sets of books.

---

## The four rules that hold it all up

1. **ONE STOCK LEDGER, MANY DOORS.** Every movement goes through
   `postStockMove()`. Nothing else may write to `cz_stock_moves`.
2. **NOTHING DERIVED IS STORED.** No balance, total, cost or profit column
   anywhere in the module.
3. **REVERSED, NEVER ERASED** — except a day sheet, which may be retyped, because
   people miscount and a stock book that refused is one kept on paper instead.
4. **SAY SO RATHER THAN GUESS.** Every screen names what it does not know instead
   of showing a confident zero.
