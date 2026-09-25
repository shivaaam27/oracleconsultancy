from kit import *
import os

def page_doc(title, sub, body, h):
    return head(title) + '''<div style="width: 1440px; height: %dpx; box-sizing: border-box; background: #F3F3F1; padding: 56px 64px; font-family: 'Geist', system-ui, sans-serif; color: #111214; display: flex; flex-direction: column; gap: 24px">
<div><h1 style="margin: 0; font-size: 52px; font-weight: 500; letter-spacing: -0.035em">%s</h1><div style="font-size: 16px; color: #55585E; margin-top: 10px; max-width: 900px; line-height: 1.5">%s</div></div>
%s
</div>
''' % (h, title, sub, body) + tail('class Component extends DCLogic { renderVals() { return {}; } }', 1440, h)

# ---------- Coverage: every page ----------
rows = [
    ('Tasks', 'Insights card (overview · by company · by person) + update card (unread → selected task → post)', 'Expanded task · filters · bulk bar · quick add · Go to', 'All 5 views, sorting, saved views, export, keyboard, bulk, undo', 'Status/priority/deadline in one click · “waiting on” · correct an update · star to top'),
    ('Home', 'Bar-per-task strip + Due today / this week', '3 swipeable cards: Tasks · People · Companies & controls', 'Needs you, company heat, ORI recap, Run automations, Send Brief', 'Everything on one screen, no scrolling'),
    ('Recurring', 'This week (tasks per day) + Next up / selected rule', 'Rule sheet: weekly/monthly, days, priority, status, assignees, description', 'On/off keeps settings, edit, set up by', 'Next run shown · remove asks first'),
    ('Calendar', 'Selected day agenda + next 7 days', 'Month / Agenda / Week / Day · layers · event form', 'Invites, Meet, .ics, Google, reminders, repeats, ticket reading, papers that travel', 'Click a day → its agenda in the card'),
    ('Director Brief', '% closed + five numbers · recommended actions', 'By company · delivered · needs attention · week ahead · statutory · people · notes', 'PDF, WhatsApp, email, copy, draft to Outbox, period/company/person filters', 'One long page, same order as the PDF'),
    ('Announcements', 'Live notice with seen/acknowledged rings · write with ORI', 'Composer: AI draft, translate, type, audience, ack, takeover, channels, schedule, expiry', 'Publish, draft, archive, delete, nudge', '—'),
    ('Outbox', '19 to chase + done ring · automatic sending status', 'List ↔ detail: reminder or draft with every send action', 'Skip today, copy, mark done, email, WhatsApp, drafts, sent log', 'Message editable before it goes'),
    ('Notes', 'Ask your notes · today’s page', 'The sheet: toolbar, / menu, to-dos, links, versions, ORI proposals', 'Folders, tags, smart folders, daily pages, templates, offline', 'Nothing in the editor changes'),
    ('People', 'Directory rings · needs attention / selected person', 'Person record: tasks, role, contact, portal, reports, journey, facts, danger zone', 'Filters, grouping, attention mode, bulk, long-press preview', 'Drawer-only features (journey, equipment, facts) move onto the record'),
    ('Companies', 'Portfolio split · most at risk', 'Company page: tasks, ORI briefing, people, documents, governance, equipment', 'Add company, departments, sites, roles with rename/merge/delete', 'Risk judged on late share, not raw totals'),
    ('Documents', 'Valid ring + expired/due · expiring next with Renew', 'Folders by company · by-expiry view · Add several (AI read)', 'Edit, renew task, archive/delete, saved views', 'By-expiry view and bulk select become reachable'),
    ('Assets & Vendors', 'Handed out vs in store · hand-over desk', 'Asset rows with assign/return · tools · vendors', 'Import, export PDF, receipts, maintenance, history', '—'),
    ('Attendance', 'Today’s tally · public holidays', 'Paint register · holidays tab', 'Brushes, mark all present, company filter, self check-in dot', '—'),
    ('Supplies', 'Stock ring + reorder/out/value · needs attention', 'Register · purchases · issues · dashboard', 'Add item, record purchase/issue, archive, “issue anyway”', 'Record purchase straight from “needs attention”'),
    ('Cleaning', 'Progress ring + who cleaned · day note', '12 area tiles with tick and comment', 'Sign off, unlock, date stepping', 'Previous days reachable from the admin side'),
    ('Insights', 'Finished this month podium · workload gauge', 'Open by company · per person · status and priority', 'Month stepper, drill into people/companies', '—'),
    ('Activity log', 'Actions per hour · needs a look', 'Today’s timeline', 'Everything/System/You/Staff, clear/restore', 'Heartbeats collapse into one line'),
    ('ORI Automation', 'Live count + last fired · quick recipes', 'Rule builder with the plain-words sentence', 'Test now, pause, cancel, built-in signals', '—'),
    ('Settings', 'Security check · install as an app', '7 sections of cards, searchable across all', 'Every card in every section', '—'),
    ('Go to', '—', 'Every page in four groups, with a live count each', '⌘K unchanged', 'Replaces the sidebar; ‹ › step through pages'),
]
cols = '150px minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr)'
table = '<div style="background: #FFFFFF; border-radius: 20px; padding: 8px 24px">' + '<div style="display: grid; grid-template-columns: %s; column-gap: 20px; padding: 12px 0; font-size: 12px; color: #8E9197; border-bottom: 1px solid #EEEEEA"><span>Page</span><span>Top cards</span><span>Inside</span><span>Kept exactly</span><span>Better or new</span></div>' % cols + ''.join(
    '<div style="display: grid; grid-template-columns: %s; column-gap: 20px; padding: 12px 0; border-bottom: 1px solid #F2F2EE; font-size: 13px; line-height: 1.45"><span style="font-weight: 600">%s</span><span>%s</span><span style="color: #55585E">%s</span><span style="color: #55585E">%s</span><span>%s</span></div>' % ((cols,) + r) for r in rows) + '</div>'
open(os.path.join(OUT, 'Coverage.dc.html'), 'w', encoding='utf-8').write(page_doc('Every page, and what it holds', 'Each page follows the same pattern: a big title, two cards that summarise, then the list or the record. Nothing a page does today is dropped — the columns say where it went.', table, 1600))
print('wrote Coverage')

# ---------- Plan ----------
phases = [
    ('0', 'Groundwork', 'Nothing visible changes', ['A “Studio” skin that only applies where it is switched on — the rest of Oracle stays exactly as it is', 'The shared pieces: page frame, two-card header, rings and arcs, textured cards, footer navigator, list + preview card', 'A switch per page in Settings so each new page can be turned on — and back off — on its own'], 'No data touched · no database change'),
    ('1', 'Tasks', 'First, as agreed', ['List with the two cards and full-width rows — built on the existing list engine, so filters, sorting, saved views, export, bulk edit, keyboard and “back to where you were” all carry over untouched', 'The update card: unread summary, preview of the picked task, post from the card using the same save as today', 'Expanded task on /task/CODE: edit one field at a time, plus the three gaps — one-click status/priority/deadline, “waiting on”, correct or take down an update', 'Cards, Board, Calendar and Timeline views keep working inside the new frame'], 'One small addition later: the ☆ “pin to top” needs one new table'),
    ('2', 'Getting around', 'Footer instead of sidebar', ['Home · ‹ page › · Settings in the footer, with Go to listing every page', 'The sidebar stays available until you are happy — switch, not delete', '⌘K search is untouched'], 'No data touched'),
    ('3', 'Home', 'The widget home', ['Bar-per-task strip, Due card, and the three swipeable cards', 'Run automations, Send Brief and Approvals keep their place'], 'No data touched'),
    ('4', 'Work pages', 'Recurring · Calendar · Director Brief · Announcements · Outbox · Notes', ['Each page gets the frame and its two cards; forms and sheets are restyled, not rewired', 'The note editor itself is not touched — only the page around it', 'The Brief PDF already has its own skin and stays as it is'], 'No data touched'),
    ('5', 'Records', 'People · Companies · Documents · Assets', ['Person and company pages get everything in one place, including what only the old drawer showed', 'Documents: the by-expiry view and bulk select finally get a button'], 'No data touched'),
    ('6', 'Operations', 'Attendance · Supplies · Cleaning — then Tax & Legal, Commitments, Applications', ['Same pattern; the paint register and cleaning ticks keep their exact behaviour'], 'No data touched'),
    ('7', 'System', 'Insights · Activity log · ORI Automation · Settings', ['Activity folds the 15-minute heartbeats into one line', 'Settings keeps one save per section and the search across all of them'], 'No data touched'),
    ('8', 'Staff portal & phone', 'Last, once the admin side is signed off', ['The portal and director board get the same skin', 'A phone pass for every page'], 'No data touched'),
]
cards = ''.join('''<div style="background: %s; color: %s; border-radius: 20px; padding: 20px 22px; display: flex; flex-direction: column; gap: 10px; %s">
<div style="display: flex; align-items: baseline; gap: 12px"><span style="font-size: 44px; letter-spacing: -0.04em; line-height: 1">%s</span><span><span style="display: block; font-size: 20px; font-weight: 500">%s</span><span style="display: block; font-size: 12px; color: %s">%s</span></span></div>
<ul style="margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.45">%s</ul>
<div style="margin-top: auto; font-size: 12px; color: %s; padding-top: 8px; border-top: 1px solid %s">%s</div></div>''' % (
    '#141517' if n == '1' else '#FFFFFF', '#F2F2F0' if n == '1' else '#111214', tex('rings') if n == '1' else '', n, t, '#A3A6AB' if n == '1' else '#8E9197', s,
    ''.join('<li>%s</li>' % b for b in bl), '#A3A6AB' if n == '1' else '#55585E', '#2A2C30' if n == '1' else '#F0F0EC', note) for n, t, s, bl, note in phases)
rules = [('Nothing is deleted until you say so', 'Every page is switched on beside the old one. You try it, then we switch. The old page is removed only after a week of the new one in use.'),
         ('The saving code does not change', 'New screens call the same save, update, post and delete actions Oracle uses today. Where a page needs to save one field at a time, it gets a small new wrapper over the same core — never a second way of writing.'),
         ('A checklist per page', 'Before a page is switched on, every line of its feature map is clicked through in the browser — and the same for the staff portal where it shares parts.'),
         ('Checked the same way every time', 'Type check, tests and a full build at the end of each phase; screenshots of the page on a laptop and a phone.'),
         ('One database change in the whole plan', 'The ☆ pin. It is an addition — nothing existing is changed or removed.')]
rule_html = '<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px">' + ''.join('<div style="border-radius: 18px; border: 1px solid #E4E4E0; padding: 16px 18px; background: #FAFAF8"><div style="font-size: 14px; font-weight: 600">%s</div><div style="font-size: 12px; color: #55585E; margin-top: 6px; line-height: 1.5">%s</div></div>' % r for r in rules) + '</div>'
body = '<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">' + cards + '</div><div style="font-size: 20px; font-weight: 500; margin-top: 8px">How we avoid breaking anything</div>' + rule_html
open(os.path.join(OUT, 'Plan.dc.html'), 'w', encoding='utf-8').write(page_doc('The build plan', 'Nine phases. Tasks goes first. Each phase ships behind its own switch, so the page you use today keeps working until the new one has earned its place.', body, 1500))
print('wrote Plan')
