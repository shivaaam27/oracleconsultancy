/**
 * `npm run guide:cocozuri`
 *
 * Builds the plain-English CocoZuri guide as a PDF.
 *
 * Written for the owner, who is not technical. Two rules govern the writing:
 * every screen in the order the work actually happens, and the money explained
 * in words rather than in debits and credits.
 *
 * ⚠️ @react-pdf/renderer PRINTS NEITHER A SHADOW NOR A GRADIENT, and fails
 * silently — every bit of depth here is a flat fill plus a hairline.
 *
 * ⚠️ NOTHING IS `wrap={false}` UNLESS IT IS SHORT. An unbreakable block taller
 * than the page is CLIPPED rather than moved, which is how the end of a long
 * paragraph disappears off the paper. Only headings and small rows are locked.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { SOURCESANS_REGULAR_B64 } from "@/assets/fonts/sourcesans-regular.b64";
import { SOURCESANS_MEDIUM_B64 } from "@/assets/fonts/sourcesans-medium.b64";
import { SOURCESANS_SEMIBOLD_B64 } from "@/assets/fonts/sourcesans-semibold.b64";

let FONT = "Helvetica";
try {
  Font.register({
    family: "Source Sans 3",
    fonts: [
      { src: `data:font/ttf;base64,${SOURCESANS_REGULAR_B64}`, fontWeight: 400 },
      { src: `data:font/ttf;base64,${SOURCESANS_MEDIUM_B64}`, fontWeight: 500 },
      { src: `data:font/ttf;base64,${SOURCESANS_SEMIBOLD_B64}`, fontWeight: 600 },
    ],
  });
  FONT = "Source Sans 3";
} catch {
  FONT = "Helvetica";
}
Font.registerHyphenationCallback((w) => [w]);

const M = 46;
const C = {
  ink: "#12161c", ink2: "#2b333e", muted: "#5a6472", faint: "#8d97a5",
  page: "#ffffff", wash: "#f7f9fc", line: "#e4e8ef", lineSoft: "#eef1f6",
  blue: "#2490ef", blueInk: "#1259a8", blueWash: "#e9f3fe", blueLine: "#d3e6fb",
  greenInk: "#157347", greenWash: "#e6f6ee", greenLine: "#cdeadb",
  amberInk: "#8a6100", amberWash: "#fdf3de", amberLine: "#f2ddb0",
  redInk: "#a92f26", redWash: "#fdeae8", redLine: "#f8d5d1",
  cocoa: "#8a5a3b", cocoaWash: "#f7efe8", cocoaLine: "#e7d5c5",
};

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 52, paddingHorizontal: M, fontSize: 10, color: C.ink2, fontFamily: FONT, lineHeight: 1.5, backgroundColor: C.page },

  coverBand: { backgroundColor: C.blueWash, borderWidth: 0.5, borderColor: C.blueLine, borderRadius: 10, padding: 22, marginBottom: 18 },
  eyebrow: { fontSize: 8, fontFamily: FONT, fontWeight: 600, color: C.blueInk, textTransform: "uppercase", letterSpacing: 1 },
  coverTitle: { fontSize: 30, fontFamily: FONT, fontWeight: 600, color: C.ink, letterSpacing: -0.9, marginTop: 6, lineHeight: 1.1 },
  coverSub: { fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 },

  h1Wrap: { flexDirection: "row", alignItems: "center", marginTop: 4, marginBottom: 12 },
  h1NumBox: { backgroundColor: C.blueWash, borderWidth: 0.5, borderColor: C.blueLine, borderRadius: 5, paddingVertical: 3, paddingHorizontal: 8, marginRight: 10 },
  h1Num: { fontSize: 10, fontFamily: FONT, fontWeight: 600, color: C.blueInk },
  h1: { fontSize: 19, fontFamily: FONT, fontWeight: 600, color: C.ink, letterSpacing: -0.4, flexGrow: 1 },
  h1Where: { fontSize: 8, color: C.faint },

  h2: { fontSize: 12.5, fontFamily: FONT, fontWeight: 600, color: C.ink, marginTop: 14, marginBottom: 4 },
  p: { fontSize: 10, color: C.ink2, marginBottom: 7, lineHeight: 1.55 },
  b: { fontFamily: FONT, fontWeight: 600, color: C.ink },

  bullet: { flexDirection: "row", marginBottom: 4, paddingRight: 6 },
  bulletDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.faint, marginTop: 6, marginRight: 8 },
  bulletText: { flexGrow: 1, fontSize: 10, color: C.ink2, lineHeight: 1.5 },

  eg: { backgroundColor: C.cocoaWash, borderWidth: 0.5, borderColor: C.cocoaLine, borderRadius: 8, padding: 13, marginVertical: 9 },
  egH: { fontSize: 7.5, fontFamily: FONT, fontWeight: 600, color: C.cocoa, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },

  note: { borderRadius: 8, borderWidth: 0.5, padding: 12, marginVertical: 9 },
  noteH: { fontSize: 7.5, fontFamily: FONT, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },

  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.lineSoft, paddingVertical: 5 },
  rowTop: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 5 },
  cell: { fontSize: 9.5, color: C.ink2, paddingRight: 8 },
  cellHead: { fontSize: 7, fontFamily: FONT, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5, paddingRight: 8 },
  cellNum: { fontSize: 9.5, color: C.ink2, textAlign: "right" },
  cellTot: { fontSize: 9.5, fontFamily: FONT, fontWeight: 600, color: C.ink },
  totRow: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6, marginTop: 1 },

  qa: { marginBottom: 8 },
  q: { fontSize: 9.8, fontFamily: FONT, fontWeight: 600, color: C.ink, marginBottom: 1 },
  a: { fontSize: 9.8, color: C.muted, lineHeight: 1.5 },

  // ⚠️ NOT `position: "absolute"`. A fixed, absolutely-positioned footer
  // renders a garbage coordinate once the document runs long enough — the
  // render dies outright with "unsupported number". `marginTop: "auto"` inside
  // the page's own column pins it to the foot of every page and cannot.
  footer: { marginTop: "auto", flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.faint, borderTopWidth: 0.5, borderTopColor: C.lineSoft, paddingTop: 6 },
});

/* ── small building blocks ───────────────────────────────────────────────── */
const P = ({ children }: { children: React.ReactNode }) => <Text style={s.p}>{children}</Text>;
const B = ({ children }: { children: React.ReactNode }) => <Text style={s.b}>{children}</Text>;
const H2 = ({ children }: { children: React.ReactNode }) => <Text style={s.h2}>{children}</Text>;

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <View style={s.bullet}>
    <View style={s.bulletDot} />
    <Text style={s.bulletText}>{children}</Text>
  </View>
);

const Stage = ({ n, title, where }: { n: string; title: string; where?: string }) => (
  <View style={s.h1Wrap} wrap={false}>
    <View style={s.h1NumBox}><Text style={s.h1Num}>{n}</Text></View>
    <Text style={s.h1}>{title}</Text>
    {where ? <Text style={s.h1Where}>{where}</Text> : null}
  </View>
);

const Eg = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={s.eg} wrap={false}>
    <Text style={s.egH}>{title}</Text>
    {children}
  </View>
);

type Tone = "blue" | "green" | "amber" | "red";
const TONE = {
  blue:  { bg: C.blueWash,  line: C.blueLine,  ink: C.blueInk },
  green: { bg: C.greenWash, line: C.greenLine, ink: C.greenInk },
  amber: { bg: C.amberWash, line: C.amberLine, ink: C.amberInk },
  red:   { bg: C.redWash,   line: C.redLine,   ink: C.redInk },
};
const Note = ({ tone, title, children }: { tone: Tone; title: string; children: React.ReactNode }) => (
  <View style={[s.note, { backgroundColor: TONE[tone].bg, borderColor: TONE[tone].line }]} wrap={false}>
    <Text style={[s.noteH, { color: TONE[tone].ink }]}>{title}</Text>
    {children}
  </View>
);

const Q = ({ q, a }: { q: string; a: string }) => (
  <View style={s.qa}>
    <Text style={s.q}>{q}</Text>
    <Text style={s.a}>{a}</Text>
  </View>
);

/** A little table. `w` are percentage widths. */
const Table = ({ head, rows, tot, w }: { head: string[]; rows: (string | number)[][]; tot?: (string | number)[]; w: string[] }) => (
  <View style={{ marginVertical: 6 }}>
    <View style={s.rowTop} wrap={false}>
      {head.map((h, i) => (
        <Text key={i} style={[s.cellHead, { width: w[i], textAlign: i === 0 ? "left" : "right" }]}>{h}</Text>
      ))}
    </View>
    {rows.map((r, ri) => (
      <View key={ri} style={s.row} wrap={false}>
        {r.map((c, ci) => (
          <Text key={ci} style={[ci === 0 ? s.cell : s.cellNum, { width: w[ci] }]}>{String(c)}</Text>
        ))}
      </View>
    ))}
    {tot ? (
      <View style={s.totRow} wrap={false}>
        {tot.map((c, ci) => (
          <Text key={ci} style={[s.cellTot, { width: w[ci], textAlign: ci === 0 ? "left" : "right" }]}>{String(c)}</Text>
        ))}
      </View>
    ) : null}
  </View>
);

const Footer = () => (
  <View style={s.footer} fixed>
    <Text>CocoZuri · Furaha Innovation Ltd · how the module works</Text>
    <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
  </View>
);

/* ── the guide ───────────────────────────────────────────────────────────── */
const Guide = () => (
  <Document title="CocoZuri — how it works, end to end" author="Oracle Consultancy">
    <Page size="A4" style={s.page} wrap>

      {/* ── cover ── */}
      <View style={s.coverBand}>
        <Text style={s.eyebrow}>Furaha Innovation Ltd · CocoZuri</Text>
        <Text style={s.coverTitle}>How it all works,{"\n"}from start to finish</Text>
        <Text style={s.coverSub}>
          Every screen, in the order the work actually happens — and what each one will not let you
          do. Followed the whole way through with one real batch of chocolate.
        </Text>
      </View>

      <P>
        This guide has one worked example running through it: <B>one batch of Amber Rabdi</B>, from
        the cocoa arriving at the door to the last bar being thrown away. The figures are made up,
        but the sums are real — you can check them.
      </P>

      <Note tone="blue" title="The whole idea, in one paragraph">
        <P>
          Everything you type goes into <B>one stock book</B> and, when you press Post, into{" "}
          <B>one set of accounts</B>. You never type the same thing twice. And nothing is saved as a
          total — every figure you see is worked out fresh when you open the page, which is why
          nothing here can quietly go out of date.
        </P>
      </Note>

      <H2>The four rules everything else follows</H2>
      <Bullet><B>One stock book, many doors.</B> A delivery, a batch, a transfer, a shop sale and a breakage all write to the same place. That is why a sale you type today already shows up in what to make next, in the month's costs, and in the food trace — for no extra work.</Bullet>
      <Bullet><B>Nothing worked out is ever saved.</B> No stored balance, total, cost or profit. It is all recalculated when you look, so it cannot drift away from the facts underneath.</Bullet>
      <Bullet><B>Corrected, never erased.</B> A mistake is fixed by a new entry that cancels the old one, and both stay visible. The one exception is the daily stock sheet, which can be retyped — people miscount, and a stock book that refuses corrections is one that gets kept on paper instead.</Bullet>
      <Bullet><B>Say so rather than guess.</B> Every screen tells you what it does not know instead of showing a confident zero. That is where all the &quot;at least&quot;, &quot;at most&quot; and &quot;not named&quot; wording comes from. It is not being awkward — it is refusing to make something up.</Bullet>

      {/* ── 0 ── */}
      <View break>
        <Stage n="0" title="Where to start" where="/cocozuri" />
        <P>
          The front page is a wall of numbers, and <B>every number is a door</B> — click it and you
          land on the list behind it. It answers one question when you sit down: <B>what is waiting
          for me?</B>
        </P>
        <P>
          Purchases nobody has approved. Recipes that cannot be costed yet. Batches still open in
          the kitchen. Transfers the shop has not counted. Returns still on the bench. Money owed,
          split by how late it is. And how many documents are waiting to go into the accounts.
        </P>
      </View>

      {/* ── 1 ── */}
      <Stage n="1" title="Set up" where="products · customers" />
      <P>Two lists you build once and then mostly leave alone: what you sell, and who you sell it to.</P>

      <H2>A price is a row with a date on it</H2>
      <P>
        This is the most important thing on this screen. A price is not a box you type over. It is a
        row with a date, and the price in force is the newest one whose date has arrived.
      </P>
      <Eg title="Why that matters">
        <P>
          Amber Rabdi sells at 2,300. On 1 September you put it up to 2,500. If the price were a box
          you typed over, every invoice you had already sent in August would silently start claiming
          2,500 — including ones the supermarket already paid at 2,300.
        </P>
        <P>
          Because it is a dated row, August keeps saying 2,300 for ever and September says 2,500.
          Nothing you do to today&apos;s price can reach backwards.
        </P>
      </Eg>
      <P>
        A customer can have <B>their own agreed price</B>, and it beats the standard list. Village
        Supermarket pays 2,300 while the shop counter charges 2,500 — same bar, two prices, both true.
      </P>

      <H2>The catalogue has real duplicates, on purpose</H2>
      <P>
        One chocolate arrived from the spreadsheets as five rows, because it had been typed five
        different ways. They were <B>not</B> merged automatically. Deciding that two spellings are
        the same bar is a business judgement, not a spelling test — so there is a <B>merge tool</B>{" "}
        on the products page and a person presses it.
      </P>
      <Q q="What if I merge two products by mistake?"
         a="Invoices that already named the losing product keep printing exactly what they always printed — descriptions are frozen onto an invoice when it is raised. Only the catalogue changes." />

      {/* ── 2 ── */}
      <View break>
        <Stage n="2" title="Buy" where="budgets · purchases" />
        <P>
          A <B>budget</B> is a pot of money for a period and a place. A <B>purchase</B> is one
          delivery. You do not need a budget to buy — but if you charge a purchase to one, the system
          will not let you quietly go over it.
        </P>

        <H2>A budget is approved by a person, on a day</H2>
        <P>
          Not by a tick, by a <B>named person at a moment</B>. The name is stored next to the record,
          because somebody may leave the company and the decision still happened. A budget nobody has
          approved cannot be charged to at all.
        </P>
        <P>
          An approved budget is <B>not edited</B>. You reopen it, which clears the approval, change
          it, and approve it again — so a budget can never quietly grow after the fact.
        </P>
        <Note tone="amber" title="Going over budget is refused until somebody says so">
          <P>
            Not because overspending is impossible — the cocoa is already in the kitchen. Because it
            should be a decision somebody made and put their name to, rather than a number that
            quietly appeared.
          </P>
        </Note>

        <H2>The supplier is optional, and must stay optional</H2>
        <P>
          Raw materials get bought at the market, at random, sometimes out of somebody&apos;s own
          pocket. A form that <B>demanded</B> a supplier name would simply not get filled in — and a
          purchase nobody records never reaches the books at all. So &quot;not named&quot; is shown
          as an ordinary fact, never as a warning.
        </P>

        <H2>Transport cost rides on the goods</H2>
        <P>
          This is the part that surprises people. If you pay 15,600 to get a delivery to the kitchen,
          that money does <B>not</B> go into a &quot;transport&quot; expense. It is shared out across
          the things you bought, in proportion to what they cost, and becomes part of their price.
        </P>
        <Eg title="Worked example · a delivery on 5 August">
          <Table
            w={["30%", "18%", "18%", "16%", "18%"]}
            head={["Line", "Quantity", "Goods", "Transport", "Really costs"]}
            rows={[
              ["Cocoa", "10 kg", "120,000", "9,600", "12,960 / kg"],
              ["Sugar", "5 kg", "15,000", "1,200", "3,240 / kg"],
              ["Wrappers", "500", "60,000", "4,800", "129.60 each"],
            ]}
            tot={["Onto the shelf", "", "195,000", "15,600", "210,600"]}
          />
          <P>
            Cocoa you paid 12,000 a kilo for actually costs you <B>12,960</B>. Put the transport into
            an expense instead and every bar you ever cost from that cocoa is 8% too cheap — and it
            looks like a healthy margin rather than a transport bill.
          </P>
        </Eg>

        <H2>Four ways of paying, and they are not the same</H2>
        <Table
          w={["24%", "50%", "26%"]}
          head={["You paid by", "What it means", "Still owed?"]}
          rows={[
            ["On account", "The supplier is owed the money", "Yes — the supplier"],
            ["Cash", "Straight out of the cash box", "No, settled"],
            ["Bank", "Straight out of the bank", "No, settled"],
            ["Own money", "A person paid for it themselves", "Yes — that person"],
          ]}
        />
        <P>
          That last one matters. If Ashit buys wrappers with his own cash, the money never left the
          company bank. Saying the supplier is owed would be wrong; saying the bank paid would be
          worse. The books say <B>Ashit</B> is owed, and stage 7 is where you pay him back.
        </P>

        <H2>Approving is what makes it count</H2>
        <P>
          A purchase starts as a <B>draft</B>. A draft moves no stock and touches no accounts — which
          is exactly what lets you start typing it while the delivery is still coming through the
          door.
        </P>
        <P>
          Press <B>Approve</B> and three things happen at once: the stock goes onto the shelf at what
          it really cost, a <B>lot</B> is created for any line where you typed an expiry date, and
          the purchase becomes something the accounts can see.
        </P>

        <Q q="What if I do not know whether the price includes VAT?"
           a="Then you cannot approve it, and that is deliberate. 1,180,000 is either 1,180,000 plus VAT or 1,180,000 including it, and the difference is real money. The field has three answers — yes, no, and nobody has said — and the third one blocks." />
        <Q q="What if I got the quantities wrong and already approved?"
           a="Cancel it. That reverses the stock rather than erasing it, so the history still shows what happened. If it has already gone into the accounts you have to reverse it there first." />
        <Q q="What if nobody wrote an expiry date on the delivery note?"
           a="No lot is created and the line is simply recorded without one. A form that insisted on a date nobody has is a form that gets abandoned. Stage 9 counts undated stock separately rather than pretending it is fresh." />
      </View>

      {/* ── 3 ── */}
      <View break>
        <Stage n="3" title="Make" where="order · recipes · batches" />

        <H2>What to make next</H2>
        <P>
          The order form looks at what actually went out and tells you what to make. The important
          detail: it divides by <B>the days somebody actually counted</B>, not by the days in the
          month. The kitchen skips days, and dividing 20 days of sales by 30 calendar days would tell
          you to make a third less than you need. With fewer than two days of history it gives you no
          figure at all, rather than a bad one.
        </P>

        <H2>Recipes work out their own cost</H2>
        <P>
          A recipe has <B>no cost box</B>. You never type what it costs and you never update it when
          cocoa goes up. It works its own cost out from what the materials really cost — the figure
          from stage 2, transport included.
        </P>
        <P>
          It uses an <B>average of everything you have bought</B>, not the most recent price. Buy one
          emergency bag at triple the price and it nudges the average; use the latest price instead
          and that one bag rewrites the cost of every recipe in the book.
        </P>

        <Eg title="Worked example · Amber Rabdi, a batch of 120 bars">
          <Table
            w={["44%", "18%", "18%", "20%"]}
            head={["Goes in", "Quantity", "At", "Cost"]}
            rows={[
              ["Cocoa", "2 kg", "12,960", "25,920"],
              ["Sugar", "1 kg", "3,240", "3,240"],
              ["Wrappers", "120", "129.60", "15,552"],
              ["Gas and labour", "", "", "6,000"],
            ]}
            tot={["Batch costs", "", "", "50,712"]}
          />
          <P>
            The recipe expects to lose <B>10%</B>, so 120 bars in means <B>108 good ones</B> out.
          </P>
          <P>
            <B>50,712 ÷ 108 = 469.56 a bar.</B> Divide by 120 instead and you get 422.60 — you would
            undercost every bar by 46.96, which is exactly the loss. The bars that survive have to
            carry the cost of the ones that did not.
          </P>
        </Eg>

        <Note tone="amber" title="When a cost cannot be known, it says so">
          <P>
            If a material has never been bought it has no cost, and the recipe shows{" "}
            <B>&quot;at least 50,712&quot;</B> with that material named — rather than quietly adding
            zero. A total with a hidden zero in it reads as cheap, and cheap is the direction of
            error nobody questions.
          </P>
        </Note>

        <H2>Batches — built around a habit that does not exist yet</H2>
        <P>
          You said it plainly: <B>we do not use batch numbers, but we are introducing them.</B> That
          changes everything about this screen. It will not fail by being wrong. It will fail by not
          being used. So the number is <B>given to you</B>, never typed; a batch <B>opens in one
          action</B>; the recipe is <B>optional</B>; and every awkward question is asked at the{" "}
          <B>end</B>, when somebody has actually finished.
        </P>
        <P>
          <B>Materials come off the shelf at the end, not the start.</B> Two reasons, and the second
          is the real one: the kitchen shelf reads true all day, and <B>abandoning a batch costs
          nothing</B> — so nobody avoids opening one in case it does not work out.
        </P>

        <Eg title="Worked example · closing the batch on 12 August">
          <P>You expected 108 good bars. You got <B>104</B>. Closing does four things at once:</P>
          <Table
            w={["46%", "54%"]}
            head={["", ""]}
            rows={[
              ["1 · Takes the materials", "Soonest-expiring first, not oldest bought"],
              ["2 · Puts 104 bars on the shelf", "The kitchen shelf, not the shop's"],
              ["3 · Fixes an expiry date", "12 Aug + 180 days = 8 Feb, but the cocoa expires 30 Nov, so 30 Nov wins"],
              ["4 · Checks the batch", "Expected 108, got 104 — you must say where the 4 went"],
            ]}
          />
          <P>
            <B>50,712 ÷ 104 = 487.62 a bar.</B> Not 469.56. The bars that came out carry the cost of
            the whole batch, and this batch went slightly worse than the recipe hoped.
          </P>
        </Eg>

        <Note tone="red" title="The check reads what really went in, never the recipe">
          <P>
            It compares what came out against what <B>actually went in</B>. If it read the recipe
            back as fact, every batch would agree with itself perfectly and the check would be
            theatre. A shortfall must say <B>where it went and why</B> — picking a reason from a list
            is not enough, you write what happened.
          </P>
        </Note>

        <Q q="What if the expiry date is not known either way?"
           a="The batch gets no expiry rather than a guessed one. A guessed expiry date on food is worse than none, because people trust it." />
        <Q q="What if I close a batch and then find the count was wrong?"
           a="Reopen it. That reverses every movement it made rather than deleting them, then you close it again with the right figure." />
        <Q q="What if more comes out than went in?"
           a="Allowed — 2 kg of cocoa really does become 108 bars. Making things is exactly that, so a batch does not have to balance the way a transfer does." />
      </View>

      {/* ── 4 ── */}
      <View break>
        <Stage n="4" title="Keep" where="stock · month end · transfers" />

        <H2>The day book is the sheet, exactly as somebody writes it</H2>
        <P>
          Four sheets — the shop, the kitchen, raw materials. Each heads its third column with a
          different word: the shop writes <B>RETURN</B>, the kitchen writes <B>DA/SA/TA</B>, raw
          materials write <B>DAMAGE</B>. Nobody has been able to say what DA/SA/TA stands for, so it
          is stored under that name and never translated into a guess.
        </P>
        <P>
          There is an <B>&quot;other&quot; column you cannot type in</B>. It shows movements that came
          from a document — a delivery, a batch, a transfer. It is shown rather than hidden so the row
          still adds up on screen; it is locked so nobody retypes a delivery and moves the same stock
          twice.
        </P>

        <H2>Month end and the stock-take</H2>
        <P>
          At the end of the month you count what is really there. The month page shows the whole
          month in one block, and it is where a count gets recorded.
        </P>
        <Note tone="amber" title="A count is the position at the END of its date">
          <P>
            So an opening stock is dated <B>the day before</B> the book starts. Get this one day
            wrong and every figure after a stock-take is out by that day&apos;s trading.
          </P>
        </Note>
        <P>
          <B>A count becomes the new truth.</B> Everything after it carries forward from what was
          counted, not from what the book claimed. A count that disagrees with the book <B>must be
          explained</B> before it will save; a count that agrees needs no reason.
        </P>
        <P>
          A row of three zeros is deleted rather than stored, because &quot;nothing moved
          today&quot; and &quot;nobody wrote anything down today&quot; are different claims — and the
          order form needs to tell them apart.
        </P>
        <P>
          When a count is posted to the accounts, a shortage is treated as a <B>loss</B> and a
          surplus as a <B>gain</B>. It is kept separate from breakage somebody actually saw, because
          &quot;we watched it break&quot; and &quot;it simply is not there&quot; are different facts
          and you want to know which is happening.
        </P>

        <H2>Transfers have two moments, and that is the whole point</H2>
        <P>
          Sending is one event. Arriving is another. In between, the chocolate is{" "}
          <B>in transit — on neither shelf</B>, which is the literal truth. Recording one figure at
          both ends is exactly what made the shop&apos;s opening stock a mystery nobody could explain.
        </P>
        <Eg title="Worked example · the kitchen sends 60, the shop counts 58">
          <Table
            w={["70%", "30%"]}
            head={["", "Bars"]}
            rows={[
              ["Kitchen shelf before", "104"],
              ["You send 60 — the kitchen shelf drops now", "−60"],
              ["Kitchen shelf after", "44"],
              ["The shop counts them in", "+58"],
            ]}
            tot={["Missing, and must be explained", "2"]}
          />
          <P>
            Those 2 bars get <B>no movement of their own</B>. They belong to neither shelf. Both ends
            of the transfer carry its reference so the loss is always answerable — but inventing a
            third movement to tidy the arithmetic would put them somewhere they never were.
          </P>
        </Eg>
        <Note tone="green" title="Same chocolate, two rows">
          <P>
            The shop&apos;s AMBER RABDI and the kitchen&apos;s are the same bar but two separate
            stock rows — you settled that. They are joined by product, <B>never by name</B>. Matching
            by name is what loses the old workbook around 200 units a month.
          </P>
        </Note>
        <Q q="What if the shop counts MORE than was sent?"
           a="Refused outright. 62 arriving from a van that left with 60 means somebody miscounted at one end, and the answer is to find out which — not to record chocolate appearing out of the air." />
        <Q q="What if I need to cancel a transfer?"
           a="Fine while it is still in transit. Once the shop has counted it in, refused — the stock is on their shelf, and cancelling would take it off a shelf it is genuinely sitting on." />
      </View>

      {/* ── 5 ── */}
      <View break>
        <Stage n="5" title="Sell" where="counter · invoices" />

        <H2>The counter is a record of a sale, not a till</H2>
        <P>
          You settled this one: cash is taken and kept in the drawer, somebody sends a WhatsApp, some
          money comes in by phone, and for now no payment system is connected — only the reporting
          becomes digital. So nothing on this screen takes payment.
        </P>
        <P>
          You write down what was sold, off which counter, and how the money came in. The chocolate
          comes off the shelf, and the day&apos;s takings split into <B>what should be in the
          drawer</B> and <B>what came in by phone</B>. The <B>kitchen is the main counter</B>, not
          the shop — the kitchen takes the bulk and custom orders, the shop the rare walk-in — so the
          form starts on the kitchen.
        </P>
        <P>
          Recording a sale a day or two late is <B>normal</B>; that is what a WhatsApp message means.
          So who sold it and who typed it are both kept. But a <B>future date is refused</B> — it
          would leave the sale out of today&apos;s takings and the shelf unchanged until that date
          came round.
        </P>

        <H2>VAT is inside the price, not added on top</H2>
        <P>
          This is the mistake the spreadsheets made, and it is worth understanding because it cost
          real money.
        </P>
        <Eg title="Worked example · 40 bars to Village Supermarket at 2,300">
          <Table
            w={["44%", "18%", "18%", "20%"]}
            head={["", "Invoice", "VAT", "Your income"]}
            rows={[
              ["Right — VAT is inside the price", "92,000", "6,018.69", "85,981.31"],
              ["The spreadsheet — 7% on top", "92,000", "6,440.00", "85,560.00"],
            ]}
            tot={["Overstated by", "", "421.31", ""]}
          />
          <P>
            Small on one invoice. Across <B>129 of 140 invoices it came to 532,296</B> — VAT declared
            that was never actually collected.
          </P>
        </Eg>

        <H2>Four things freeze the moment you issue an invoice</H2>
        <P>
          The customer&apos;s details, the VAT rate, the payment terms, and the wording of each line.
          An invoice prints what was true the day it was raised, permanently. Change the
          customer&apos;s address next month and last month&apos;s invoice still shows the old one —
          because that is what you sent them.
        </P>

        <H2>A credit note is how you correct an invoice</H2>
        <P>
          An <B>issued invoice is never edited</B>. If something was wrong, or goods came back, you
          raise a <B>credit note</B> — the same kind of document with its own numbering, which
          reduces what the customer owes. Both papers stay: the invoice you sent, and the correction
          you sent afterwards. That is what an auditor expects to see, and what a customer expects
          to be able to match against their own records.
        </P>
        <P>
          A credit note can be attached to a particular invoice, or stand on its own. If it stands
          alone it still reduces what the customer owes, but it cannot be counted as
          &quot;30 days late&quot; against any particular bill — so it is shown separately rather
          than quietly mixed in.
        </P>

        <Q q="What if a walk-in has no account?"
           a="They do not need one. The counter suggests a price and then lets you type over it, because bulk and custom orders get agreed on the spot." />
        <Q q="What if I give something away free?"
           a="A zero price is allowed. A missing price is not — those are different things, and only one of them is a decision." />
        <Q q="What if I type a negative quantity for something coming back?"
           a="Refused. Something coming back is a return, and it has its own screen at stage 8 that does several things a negative sale would not." />
      </View>

      {/* ── 6 ── */}
      <View break>
        <Stage n="6" title="Get paid" where="receipts · owed · statements" />
        <P>
          Record money coming in against the invoices it pays. <B>The customer comes off the invoice,
          never off the form</B> — a receipt for one customer against another&apos;s invoice is not
          something that should be typeable at all.
        </P>
        <P>
          One cheque covering four invoices becomes <B>four rows sharing a date and a reference, all
          or nothing</B>. Nothing ever sits &quot;on account&quot; waiting for somebody to work out
          later what it was for. An overpayment is recorded as it stands and shown as a negative.
        </P>
        <P>
          Only <B>issued</B> documents are owed. A draft has not been sent to anybody, so the payment
          screen will not even offer it.
        </P>

        <Note tone="red" title="Five ageing bands, and they stay five">
          <P>
            Not yet due · 1–30 · 31–60 · <B>61–90</B> · 91 and over. The old spreadsheet jumped from
            31–60 straight to 91+, so everything <B>61 to 90 days late was reported a month younger
            than it was</B> — 1,567,000 of it on the day the books were read. There is a test that
            checks every single day from −10 to 200 lands in exactly one band.
          </P>
        </Note>

        <H2>Statements</H2>
        <P>
          A statement is one customer&apos;s whole account over a period, on one printable page:
          every invoice, every credit note, every payment, and what is left. The period is part of
          the address, so a statement can be bookmarked, re-opened next month, or sent to a customer
          who is querying their balance.
        </P>
        <P>
          It is the document to reach for when somebody says <B>&quot;we have already paid
          that&quot;</B> — it shows, in date order, exactly what was billed and what came in.
        </P>
      </View>

      {/* ── 7 ── */}
      <View break>
        <Stage n="7" title="Pay out" where="payments" />
        <P>
          Only two of the four ways of paying leave anything owed: <B>on account</B> and <B>own
          money</B>. A purchase paid from the bank or the cash box was settled the day it was bought
          — paying it again would take the money out of the bank twice.
        </P>
        <P>
          And you pay <B>whoever the purchase said was owed</B>. If Ashit bought the wrappers
          himself, this screen pays <B>Ashit</B> back, not the supplier.
        </P>
        <P>
          One payment covering several purchases is one row each, all or nothing — the same rule as
          money coming in, for the same reason. An overpayment shows as a negative. And a payment
          that has already gone into the accounts <B>cannot be deleted, only reversed</B>, so the
          history of what you paid and when survives the correction.
        </P>

        <H2>What you have not got yet</H2>
        <P>
          Wages, rent, electricity and the rest are not on this screen. It pays for <B>things you
          bought</B>. Everyday running costs go in through the ordinary accounts, not through
          CocoZuri.
        </P>
      </View>

      {/* ── 8 ── */}
      <View break>
        <Stage n="8" title="Put right" where="returns" />
        <P>One screen, two completely different situations, and only one puts chocolate back on a shelf.</P>
        <Table
          w={["32%", "30%", "38%"]}
          head={["Situation", "Stock", "Why"]}
          rows={[
            ["A customer sends bars back", "Goes back on the shelf", "It left the books the day it was sold, so it has to come back on"],
            ["Breakage found in-house", "Nothing moves yet", "It never went anywhere — it is still on your own shelf"],
          ]}
        />

        <H2>The bench — the state nobody could see before</H2>
        <P>
          Chocolate that came back but has not been judged yet is <B>on a bench being sorted</B>. It
          is neither sellable stock nor thrown away. It can be sorted in more than one go: five bars
          repacked today and five thrown next week is the real case, so the screen lets you come back
          to it.
        </P>

        <Eg title="Worked example · Village returns 6 bars crushed in transit">
          <Table
            w={["70%", "30%"]}
            head={["", "Bars"]}
            rows={[
              ["Booked in — back onto the shop shelf", "+6"],
              ["Sorted: repacked and sellable", "2"],
              ["Sorted: thrown away", "4"],
            ]}
            tot={["Thrown away, at what it cost — 4 × 487.62", "1,950.48"]}
          />
          <P>
            Written off at <B>487.62</B>, what it cost to make — never at 2,300, what it would have
            sold for. Throwing away a bar costs you the cocoa, not the profit you were hoping for.
          </P>
          <P>
            The credit note is priced off <B>the original invoice</B> at 2,300 — not today&apos;s
            price list — and it credits <B>what came back</B> (6), not what you managed to repack. It
            arrives as a draft for you to check before it goes out.
          </P>
        </Eg>

        <Note tone="amber" title="A return does not need a second entry to put the cost back">
          <P>
            Goods coming back are a positive movement on the shelf, so they reduce the month&apos;s
            costs all by themselves at stage 9. Adding an entry to &quot;put the cost back&quot;
            would count the same chocolate twice.
          </P>
        </Note>
      </View>

      {/* ── 9 ── */}
      <View break>
        <Stage n="9" title="Know" where="profit · trace" />

        <H2>Profit — and the honest thing it will not tell you</H2>
        <P>
          You can see what a batch <B>cost</B> and what its bars are <B>worth</B>. You cannot see
          what a batch <B>earned</B>, and the page says so out loud — because an invoice line names a
          product, not a batch. Nothing today links the bar that was sold back to the batch it came
          from.
        </P>

        <Eg title="Worked example · one bar sold to Village at 2,300">
          <Table
            w={["70%", "30%"]}
            head={["", "TZS"]}
            rows={[
              ["Price on the invoice", "2,300.00"],
              ["Less the VAT inside it", "−150.47"],
              ["What you actually earned", "2,149.53"],
              ["What it cost to make", "−487.62"],
            ]}
            tot={["Profit on the bar — 77.3%", "1,661.91"]}
          />
          <P>
            Compare the cost straight against 2,300 and you would report <B>78.8%</B>. Costs have no
            VAT in them and a CocoZuri invoice does — comparing them directly flatters every margin
            you have.
          </P>
        </Eg>

        <H2>Once a month, the cost of what you sold</H2>
        <Eg title="Worked example · August">
          <Table
            w={["70%", "30%"]}
            head={["", "Bars"]}
            rows={[
              ["Sold at the counter", "12"],
              ["Sold on invoice", "40"],
              ["Came back from Village", "−6"],
              ["Net bars sold", "46"],
            ]}
            tot={["Cost of what you sold — 46 × 487.62", "22,430.52"]}
          />
          <P>
            The 4 bars you threw away are <B>not</B> in there — they were already charged as breakage
            at stage 8, and counting them here would charge them twice.
          </P>
        </Eg>

        <Note tone="red" title="Where the &quot;at most&quot; wording comes from">
          <P>
            If a month contains chocolate that has never been costed, the system <B>refuses to post
            it and names what is missing</B>. Understating your costs overstates your profit, which is
            the one direction of error nobody ever questions. So profit shows as <B>&quot;at
            most&quot;</B> — a ceiling, not a floor. Today <B>113 chocolates have never been
            costed</B>, which is a gap in the data, not in the software.
          </P>
        </Note>

        <H2>Trace — the screen you will hopefully never need</H2>
        <P>It answers the two recall questions, from either end:</P>
        <Bullet><B>From a batch:</B> what went into it, back to the bag and the supplier.</Bullet>
        <Bullet><B>From a bag of cocoa:</B> exactly what was made from it, and nothing else.</Bullet>
        <P>
          Plus what is going off soonest — with <B>anything carrying no date at all counted
          separately</B>, which in a food business is the finding that actually matters.
        </P>
        <Note tone="green" title="Soonest to expire goes first — not oldest bought">
          <P>
            A bag bought later can go off sooner. Taking the older bag would leave the one about to
            expire sitting on the shelf until it does. So a batch takes the soonest-expiring lot
            first, and a bag with no date at all goes last and is reported to you.
          </P>
        </Note>
      </View>

      {/* ── the money, in words ── */}
      <View break>
        <Stage n="£" title="The money side, in plain words" />
        <P>
          Nothing reaches the accounts by itself. Somebody presses <B>Post</B>, and the front page
          tells you how many documents are waiting. Anything posted can be <B>reversed</B>; nothing
          can be deleted.
        </P>
        <P>
          Below is what each document means in ordinary language. You do not need to know the
          bookkeeping words — but if you ever sit with an accountant, this is what they will be
          looking at.
        </P>

        <Table
          w={["30%", "70%"]}
          head={["When you…", "What it means"]}
          rows={[
            ["Issue an invoice", "The customer owes you the full amount. Your income is the amount without VAT. The VAT is money you are holding for the taxman."],
            ["Raise a credit note", "The same thing backwards — the customer owes you less, your income goes down, and so does the VAT you owe."],
            ["Take money in", "The bank or cash box goes up, and what the customer owes you goes down. Your income does not change — it was already counted when you invoiced."],
            ["Sell at the counter", "Cash or bank goes up, income goes up, VAT goes up. Nobody owes you anything, because it was paid there and then."],
            ["Approve a purchase", "Your stock goes up by what the goods really cost, transport included. Either you now owe the supplier, or a person, or the money has left the bank or cash box."],
            ["Pay somebody", "What you owe goes down, and so does the bank or cash box."],
            ["Throw stock away", "Stock goes down and you have a loss, valued at what it cost you — never at what it would have sold for."],
            ["Close the month", "The cost of everything you sold moves out of stock and becomes a cost for the month. One entry, once a month."],
            ["Finish a stock count", "A shortage is a loss, a surplus is a gain, and both are kept apart from breakage you actually saw."],
          ]}
        />

        <Note tone="blue" title="Two things it will never do">
          <P>
            <B>VAT is never your income.</B> Your income is always the amount without it. The VAT is
            money you are holding on behalf of the taxman and will hand over.
          </P>
          <P>
            <B>Money received into another company&apos;s bank is refused.</B> The &quot;received in
            DSC&quot; question is still open, and recording it as CocoZuri&apos;s would be untrue in
            two sets of books at once.
          </P>
        </Note>
      </View>

      {/* ── open questions ── */}
      <View break>
        <Stage n="?" title="Three things it still needs from you" />
        <P>
          None of these stops you using it. All three are waiting on a decision only you can make,
          and the screens say so where it matters rather than guessing.
        </P>
        <H2>1 · Should CocoZuri&apos;s books be open, and from what date?</H2>
        <P>
          A full set of accounts is ready and waiting, but nothing should be posted until you say
          which day the books start from.
        </P>
        <H2>2 · Why is money received &quot;in DSC&quot;?</H2>
        <P>
          Until that is answered, money banked in another company is refused rather than quietly
          recorded somewhere plausible.
        </P>
        <H2>3 · What date did each set of prices come into force?</H2>
        <P>
          Every price in the catalogue is currently dated 21 August 2026 — the day it was{" "}
          <B>imported</B>, not the day it started. So nothing sold before that date can be valued
          yet. The list is headed February 2026, which suggests the real date is much earlier, but
          the prices came from two different sources with two different real dates and guessing at
          them would be worse than leaving them.
        </P>
      </View>

      <Footer />
    </Page>
  </Document>
);

async function main() {
  const out = process.argv[2] ?? resolve(process.cwd(), "..", "..", "..", "CocoZuri - how it works.pdf");
  const buf = await renderToBuffer(<Guide />);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
}

main();
