# Director pages on a phone and a tablet (Studio, 25 Sept 2026).
# Every board mirrors the page as it is BUILT today (same cards, same words,
# same order) and only reshapes what does not fit. Run: python gen/p_mobile.py
import json, os, random
from kit import ic, AVC
from mkit import *

random.seed(7)
B = []
T = [
    ('late', 'Cocofix Payment', 'CC-026', 'Furaha Innovation', 'JS', '3d late', True),
    ('late', 'ERP meeting', 'PE-026', 'PES Ltd', 'PM', '2d late', True),
    ('late', 'Cash flow planning meeting', 'DS-041', 'DSC Ltd', 'JS', '2d late', False),
    ('late', 'Plan Of Action', 'CC-022', 'Furaha Innovation', 'DB', '1d late', False),
    ('soon', 'Bank and TRA Machine Reconciliation', 'CC-002', 'Furaha Innovation', 'KA', 'Sat 26', True),
    ('soon', 'CCTV, Fridge, Storage, Chillers', 'VI-006', 'V1 Intertrade', 'HS', 'Sat 26', False),
    ('ok', 'ISO Certification — full details', 'ME-012', 'MES Ltd', 'GM', 'Tue 30', False),
    ('ok', 'Update on WTP costs', 'PE-029', 'PES Ltd', 'PM', 'Fri 3 Oct', True),
    ('none', 'itrust account opening', 'PE-028', 'PES Ltd', 'SP', 'No date', False),
    ('none', 'DSC Debtor Reports', 'DS-045', 'DSC Ltd', 'VP', 'No date', False),
    ('none', 'Statutory Documents', 'VI-007', 'V1 Intertrade', 'AS', 'No date', False),
]


def task_rows(n, start=0, who=True):
    out = ''
    for t in T[start:start + n]:
        extra = '<div style="margin-top:4px;display:flex;justify-content:flex-end">%s</div>' % av(t[4], 20) if who else ''
        out += row(t[0], t[1], '<span class="mo">%s</span> · %s' % (t[2], t[3]), t[5], t[6], extra)
    return out


def activity_bars(n=64, h=48):
    vals, cols = [], []
    for i in range(n):
        v = random.uniform(.3, 1)
        vals.append(v)
        cols.append(LATE if i > n - 14 else SOON if i > n - 18 else OK if i > 14 else '#C9CD3C')
    return vals, cols


# ─────────────────────────────── 0 · The rules ───────────────────────────────
def rules():
    goto = ('<div class="scrim"></div><div class="sh" style="padding:0 16px 20px">'
            '<div class="grab"></div>'
            '<div style="display:flex;align-items:center;gap:12px;padding:14px 2px 12px;border-bottom:1px solid #F0F0EC">%s'
            '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:600">Mr Pulin Manek</div><div class="t2">Director · every company</div></div>'
            '<span class="ib">%s</span><span class="ib">%s</span></div>'
            '<div class="sin" style="margin:12px 0">%sGo to a page</div>'
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">%s</div>'
            '<div style="display:flex;gap:8px;margin-top:12px"><span class="btn" style="flex:1">%sProfile</span><span class="btn" style="flex:1;color:#C2327F;border-color:#F5C6DF">Sign out</span></div>'
            '</div>') % (av('PM', 44), ic('user', 16), '<span style="font-size:15px">☾</span>', ic('search', 15),
                         ''.join('<div style="height:68px;border-radius:14px;%s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px">%s%s</div>' % (
                             'background:#111214;color:#fff' if l == 'Tasks' else 'background:#F3F3F1', ic(i, 17), l)
                             for l, i in [('Home', 'home'), ('Tasks', 'list'), ('Calendar', 'cal'), ('Announce…', 'bell'), ('Outbox', 'send'), ('Companies', 'building'), ('People', 'users'), ('Files', 'folder'), ('Chat', 'chat')]),
                         ic('user', 15))
    inner = ('<div class="pg"><div class="hd"><h1 class="h1">Tasks</h1><span class="ibd">%s</span></div>%s'
             '<div class="dk rings" style="height:150px"><div class="ct"><span>Overview</span>%s</div></div></div>') % (ic('filter', 16), chips(['All companies', 'Everyone']), dots(2))
    rule = lambda n, t, d: '<div style="display:grid;grid-template-columns:28px 1fr;gap:10px;margin:0 0 14px"><span style="width:26px;height:26px;border-radius:8px;background:#111214;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center">%s</span><div><div style="font-size:14px;font-weight:600">%s</div><div style="color:#55585E">%s</div></div></div>' % (n, t, d)
    nt = ('<div class="nt" style="width:520px"><span class="tag">Director · phone &amp; tablet</span><h2>The rules every page follows</h2>'
          '<p style="margin:10px 0 18px;color:#55585E">Nothing is taken away — the same cards, words and order as on the desk. What does not fit a hand is reshaped, never hidden.</p>'
          + rule(1, 'The footer fits a thumb', 'Phone: Home · ‹ page › · bell · +. Nothing falls off the edge any more (the + was cut off). Profile, sign out and light/dark move into the Go-to sheet, which opens from the page name.')
          + rule(2, 'The list comes first', 'The two dark summary cards become ONE card you swipe through (dots show there is a second). The first screen always reaches the list.')
          + rule(3, 'One tap target size', 'Every button, chip and row is at least 40px tall. Text never drops under 12px.')
          + rule(4, 'Filters scroll sideways', 'A row of chips slides left and right instead of wrapping into three lines.')
          + rule(5, 'Records: one main action', 'A task, person or company shows its main action as a button; the rest sit behind ⋯ in a sheet. Tabs scroll sideways under the header.')
          + rule(6, 'Details open as sheets', 'An Outbox item, a file, an event: on a phone they slide up full height with a back arrow; on a tablet they sit beside the list.')
          + rule(7, 'Search floats 10px above the footer', 'Same bar as the desk, full width minus the gutters, with the status chips sliding under it.')
          + rule(8, 'Tablet = desk, one step narrower', 'Portrait iPad keeps the two summary cards side by side (shorter), lists keep their key columns, and a record shows its details panel beside it. iPad landscape (1180 wide) already uses the desk layout.')
          + '</div>')
    B.append(board('M_Rules.dc.html', 'Phone & tablet — the rules', [nt, phone(inner, 'Tasks', 'Phone · the Go-to sheet (tap the page name)', overlay=goto),
                                                                            phone(inner + '<div class="fade"></div>', 'Tasks', 'Phone · the footer, fitted')]))


# ─────────────────────────────── 1 · Home ───────────────────────────────
def home():
    v, c = activity_bars(44, 44)
    hero = ('<div class="dk contour"><div style="font-size:12px;color:#A3A6AB">Good morning, Pulin · Friday 25 September</div>'
            '<div style="font-size:24px;letter-spacing:-0.02em;line-height:1.1;margin:8px 0 14px">Your 70 open tasks, at a glance</div>'
            '<div style="display:flex;gap:22px;margin-bottom:14px">%s</div>%s'
            '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:11px;color:#A3A6AB">%s</div></div>') % (
        ''.join('<div><div style="font-size:34px;letter-spacing:-0.04em;line-height:1">%s</div><div style="font-size:11px;color:%s;margin-top:4px">%s</div></div>' % x for x in [('16', '#F07BBE', 'late'), ('3', '#F5B94E', 'due soon'), ('37', '#5BE0A5', 'done this month')]),
        bars(v, c, 44, 4, 2),
        ''.join('<span style="display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:2px;background:%s"></span>%s</span>' % x for x in [('#C9CD3C', 'Quiet 7+ days · 13'), (OK, 'Moving · 38'), (SOON, 'Due soon · 3'), (LATE, 'Late · 16')]))
    due = ('<div class="dk rings"><div class="ct"><span style="font-size:15px;color:#F2F2F0">Due today</span>%s</div>'
           '<div style="display:flex;align-items:baseline;gap:10px;margin:10px 0 12px"><span class="bigs">1</span><span style="color:#A3A6AB;font-size:13px">thing in the diary</span></div>'
           '<div style="background:#1F2023;border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;font-size:13px"><span class="d" style="background:%s"></span><span style="flex:1">6 Months Projection Plan</span><span class="mo">TG-001</span></div></div>') % (
        '<span class="sg" style="background:#1F2023;padding:2px"><span class="sgi sgo" style="height:26px;flex:none">Today</span><span class="sgi" style="height:26px;flex:none;color:#A3A6AB">This week</span></span>', SOON)
    late = ('<div class="wc"><div class="t2" style="margin:0">Tasks</div><div class="wct" style="font-size:20px;font-weight:500;letter-spacing:-0.02em">Late, needs you<span style="display:flex;gap:6px"><span class="ib" style="width:34px;height:34px">%s</span><span class="ib" style="width:34px;height:34px">%s</span></span></div>'
            '<div class="t2" style="margin:2px 0 6px">16 late · worst first</div>%s</div>') % (ic('left', 13), ic('right', 13), task_rows(4, 0, False))
    ph = '<div class="pg">%s%s%s</div>' % (hero, due, late)
    ph2 = ('<div class="pg" style="margin-top:-230px">%s%s</div>') % (late, '<div class="wc"><div class="wct">Unread updates<span>32</span></div>%s</div>' % task_rows(3, 4, False))
    tv, tc = activity_bars(96, 60)
    thero = ('<div class="dk contour" style="display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end">'
             '<div><div style="font-size:12px;color:#A3A6AB">Good morning, Pulin · Friday 25 September</div><div style="font-size:30px;letter-spacing:-0.025em;margin:8px 0 16px">Your 70 open tasks, at a glance</div>%s</div>'
             '<div style="display:flex;gap:26px">%s</div></div>') % (bars(tv[:70], tc[:70], 60, 4, 2),
                                                                  ''.join('<div style="text-align:right"><div style="font-size:44px;letter-spacing:-0.04em;line-height:1">%s</div><div style="font-size:11px;color:%s;margin-top:4px">%s</div></div>' % x for x in [('16', '#F07BBE', 'late'), ('3', '#F5B94E', 'due soon'), ('37', '#5BE0A5', 'done this month')]))
    tb = ('<div class="pgt">%s<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s%s</div>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div class="wc"><div class="wct">Unread updates<span>32</span></div>%s</div><div class="wc"><div class="wct">Next deadlines<span>this week</span></div>%s</div></div></div>') % (
        thero, due, late.replace(task_rows(4, 0, False), task_rows(3, 0, False)), task_rows(3, 4, False), task_rows(3, 6, False))
    nt = notes('Home', 'Director · 1 of 12', [
        'The greeting card keeps its three numbers and the activity bars, sized to a hand: the numbers sit in one row, the bars are 44px tall.',
        'Due today and Late, needs you follow in the same order as the desk — nothing new, nothing removed.',
        'Every row is a 48px door to its task.'], [
        'The greeting card runs full width with the numbers on the right, as on the desk.',
        'The widgets pair up two by two below it.'], ['Which widgets you see and their order.'])
    B.append(board('M_Home.dc.html', 'Home — phone & tablet', [nt, phone(ph, 'Home', 'Phone · first screen'), tablet(tb, 'Home')]))


# ─────────────────────────────── 2 · Tasks ───────────────────────────────
def tasks():
    summ = ('<div class="dk rings"><div class="ct"><span>Overview</span>%s</div>'
            '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:10px"><div><span class="big">70</span><span class="u">open tasks</span></div><span class="dp" style="color:#5BE0A5"><span class="d" style="background:%s"></span>74%% on track</span></div>'
            '<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;margin:14px 0 10px;gap:2px"><span style="flex:16;background:%s"></span><span style="flex:3;background:%s"></span><span style="flex:3;background:%s"></span><span style="flex:48;background:#3A3C40"></span></div>'
            '<div style="display:flex;gap:12px;font-size:11px;color:#A3A6AB"><span>● 16 late</span><span>● 3 due soon</span><span>● 3 on schedule</span><span>48 no date</span></div></div>') % (dots(2), OK, LATE, SOON, OK)
    lst = '<div class="wc" style="padding:4px 14px">%s</div>' % task_rows(7, 0)
    bar = ('<div class="sbar"><div class="sin">%sSearch — a task, a code, a person</div><div class="cr" style="margin:0;padding:0">%s</div></div>') % (
        ic('search', 16), ''.join('<span class="ch%s" style="height:32px">%s</span>' % (' cho' if i == 0 else '', x) for i, x in enumerate(['All 70', '<span class="d" style="background:%s"></span>On track 51' % OK, '<span class="d" style="background:%s"></span>Due soon 3' % SOON, '<span class="d" style="background:%s"></span>Late 16' % LATE])))
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Tasks</h1><span style="display:flex;gap:8px"><span class="ib">%s</span><span class="ibd">%s</span></span></div>%s%s'
          '<div class="t2" style="display:flex;justify-content:space-between;margin:2px 2px -4px"><span>16 late first</span><span>Sort · Deadline</span></div>%s</div><div class="fade"></div>%s') % (
        ic('list', 16), ic('filter', 16), chips(['All companies', 'Everyone']), summ, lst, bar)
    # tablet
    unread = ('<div class="dk contour"><div class="ct"><span>Unread updates</span><span>1 of 11 ‹ ›</span></div><div style="display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:end;margin-top:10px">'
              '<div><span class="big">32</span><div style="font-size:12px;color:#A3A6AB;margin-top:6px">unread updates</div></div><div style="display:flex;flex-direction:column;gap:8px">%s</div></div></div>') % (
        ''.join('<div style="background:#1F2023;border-radius:12px;padding:8px 10px;display:flex;gap:8px;align-items:center">%s<div style="min-width:0"><div style="font-size:11px;color:#A3A6AB">%s</div><div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">%s</div></div></div>' % (av(a, 24, '#1F2023'), b, c)
                for a, b, c in [('SP', 'Dar Distributors Instagram Plan', '@Mr Shivam Parmar will send you page on email'), ('JS', 'Shelving quotations', 'The centre shelve is not included…'), ('KS', 'VI P28', 'Finalising with power computers…')]))
    thead = '<div style="display:grid;grid-template-columns:minmax(0,1fr) 70px 170px 76px;gap:12px;padding:10px 16px;font-size:11px;color:#8E9197;border-bottom:1px solid #F0F0EC"><span>Task</span><span>Who</span><span>Latest update</span><span style="text-align:right">Deadline</span></div>'
    trows = ''.join('<div style="display:grid;grid-template-columns:minmax(0,1fr) 70px 170px 76px;gap:12px;padding:12px 16px;align-items:center;border-bottom:1px solid #F0F0EC"><div style="min-width:0;display:flex;gap:10px;align-items:center"><span class="d" style="background:%s;flex-shrink:0"></span><div style="min-width:0"><div class="t1">%s</div><div class="t2"><span class="mo">%s</span> · %s</div></div></div><span>%s</span><span class="t2" style="margin:0">%s</span><span class="rt" style="color:%s">%s</span></div>' % (
        DOT[t[0]], t[1], t[2], t[3], faces([t[4]] + (['PM'] if i % 3 == 0 else [])), ['In process, awaiting sign-off', 'Mr Jitesh is reviewing', 'No updates yet', 'Called the bank Thursday'][i % 4], TXT[t[0]], t[5]) for i, t in enumerate(T[:9]))
    tbar = ('<div class="sbar" style="left:60px;right:60px;flex-direction:row;align-items:center"><div class="sin" style="flex:1">%sSearch — a task, a code, a company or a person</div>%s</div>') % (
        ic('search', 16), ''.join('<span class="ch%s" style="height:36px">%s</span>' % (' cho' if i == 0 else '', x) for i, x in enumerate(['All 70', 'Late 16', 'Due soon 3'])))
    tb = ('<div class="pgt"><div class="hd"><div style="display:flex;align-items:flex-end;gap:14px"><h1 class="h1t">Tasks</h1>%s</div><span style="display:flex;gap:8px">%s<span class="ibd" style="width:auto;padding:0 14px;gap:8px;font-size:13px">%sFilters</span></span></div>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s%s</div><div class="wc" style="padding:0">%s%s</div></div><div class="fade"></div>%s') % (
        '<span style="display:flex;gap:8px;padding-bottom:4px">%s</span>' % chips(['All companies', 'Everyone']).replace('class="cr"', 'style="display:flex;gap:8px"'),
        seg([ic('list', 14) + ' List', ic('grid', 14), ic('cal', 14)], 0).replace('flex:1;', ''), ic('filter', 15), summ.replace('class="big"', 'class="bigs"').replace(dots(2), ''), unread.replace('class="big"', 'class="bigs"'), thead, trows, tbar)
    nt = notes('Tasks', 'Director · 2 of 12', [
        'Title, then company and person filters on one sliding row. Filters (the black button) opens the full filter sheet.',
        '<b>Overview and Unread updates become one card you swipe</b> (dots top right) — 150px instead of two cards filling the screen, so the list starts on the first screen.',
        'Each task is one row: status dot, name, code · company, deadline on the right in its colour, a blue dot when there is an update you have not read, who is on it underneath.',
        'The search bar floats above the footer with the status chips (All · On track · Due soon · Late) sliding beneath it.',
        'Views: List and Board. Cards, Calendar and Timeline stay on the tablet and desk (too wide for a hand).'], [
        'Both summary cards side by side, shorter (≈180px).',
        'The table keeps four columns — Task · Who · Latest update · Deadline. Status becomes the dot in front of the name.',
        'Search bar floats centred with the three main chips.'], ['Tick boxes and the bulk bar (press and hold a row on a phone to start ticking).', 'Tapping a row opens the task page.'])
    B.append(board('M_Tasks.dc.html', 'Tasks — phone & tablet', [nt, phone(ph, 'Tasks', 'Phone · first screen, list reached'), tablet(tb, 'Tasks')]))


# ─────────────────────────────── 3 · Task record ───────────────────────────────
def task():
    hero = ('<div class="dk rings" style="border-radius:0 0 22px 22px;margin:0 -16px;padding:14px 16px 16px">'
            '<div style="display:flex;justify-content:space-between;align-items:center"><span class="back" style="color:#C9CBCF">%sTasks</span><span style="display:flex;gap:8px;align-items:center"><span class="mo" style="color:#A3A6AB">PE-026 · PES Ltd</span><span class="fb" style="width:36px;height:36px">%s</span></span></div>'
            '<div style="font-size:26px;letter-spacing:-0.025em;margin:14px 0 10px">ERP meeting</div>'
            '<div style="display:flex;flex-wrap:wrap;gap:6px">%s</div>'
            '<div style="display:flex;gap:8px;margin-top:14px"><span class="btnw" style="flex:1">%sComplete</span><span class="btng" style="flex:1">Escalate</span></div></div>') % (
        ic('left', 16), ic('more', 16), ''.join('<span class="dp">%s</span>' % x for x in ['<span class="d" style="background:%s"></span>In Progress' % BLUE, '<span style="color:#F07BBE">22 Sept · 3 days late</span>', 'Medium priority', 'Mr Pulin Manek']), ic('check', 15))
    conv = ('<div class="tabs" style="margin-top:4px"><span class="on">Conversation 1</span><span>Details</span><span>History 4</span><span>Notes</span></div>'
            '<div style="text-align:center;font-size:11px;color:#8E9197;margin:4px 0">22 SEPTEMBER 2026</div>'
            '<div style="text-align:center;font-size:12px;color:#8E9197">Deadline → 22 Sept 2026 · 09:45</div>'
            '<div style="text-align:center;font-size:12px;color:#8E9197">Status → In Progress · 14:51</div>'
            '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span style="font-size:11px;color:#8E9197">Administrator · 14:52</span><span class="bub" style="background:#111214;color:#fff">Mr Jitesh is reviewing</span><span style="font-size:11px;color:#8E9197">Seen by Mr Pulin Manek</span></div>')
    comp = ('<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #E4E4E0;padding:10px 12px 12px;z-index:3">'
            '<div class="cr" style="margin:0 -12px 8px;padding:0 12px">%s</div>'
            '<div style="display:flex;gap:8px;align-items:center"><span class="ib" style="border:0;background:#F3F3F1">%s</span><div class="sin" style="flex:1;height:42px">Write an update… @ to mention</div><span class="ibd">%s</span></div></div>') % (
        ''.join('<span class="ch" style="height:32px">%s</span>' % x for x in ['Still on it', 'Waiting on', 'Done, ready to close', 'Need your decision']), ic('clip', 16), ic('arrowup', 16))
    sheet = ('<div class="scrim"></div><div class="sh" style="padding:0 16px 22px"><div class="grab"></div><div style="font-size:13px;color:#8E9197;padding:12px 4px 6px">ERP meeting · PE-026</div>%s</div>') % (
        ''.join('<div style="height:50px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #F0F0EC;font-size:15px;%s">%s%s</div>' % ('color:#C2327F;border:0' if l == 'Delete…' else '', ic(i, 17), l)
                for l, i in [('Copy to other companies', 'copy'), ('Change deadline', 'cal'), ('Repeat…', 'repeat'), ('Archive', 'box'), ('Delete…', 'trash')]))
    ph = '<div class="pg" style="gap:12px">%s%s</div>%s' % (hero, conv, comp)
    det = ('<div class="pg" style="gap:12px">%s<div class="tabs"><span>Conversation 1</span><span class="on">Details</span><span>History 4</span><span>Notes</span></div>%s</div>') % (
        hero, '<div class="wc" style="padding:4px 16px">%s</div>' % ''.join('<div style="display:flex;justify-content:space-between;align-items:center;min-height:48px;border-bottom:1px solid #F0F0EC;font-size:14px"><span style="color:#8E9197">%s</span><span>%s</span></div>' % x for x in [
            ('Company', 'PES Ltd'), ('Who', faces(['PM', 'JS'], 26)), ('Deadline', '<span style="color:#C2327F">22 Sept · 3d late</span>'), ('Priority', 'Medium'), ('Repeats', 'No'), ('Category', 'Meetings'), ('Raised by', 'Administrator · 18 Sept')]))
    # tablet
    tb = ('<div class="pgt" style="display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;align-items:start">'
          '<div style="display:flex;flex-direction:column;gap:14px">%s<div class="wc">%s</div></div>'
          '<div class="wc" style="padding:6px 16px"><div class="wct" style="padding:8px 0">Details</div>%s</div></div>') % (
        hero.replace('border-radius:0 0 22px 22px;margin:0 -16px;', 'border-radius:20px;').replace('<span class="btnw" style="flex:1">', '<span class="btnw">').replace('<span class="btng" style="flex:1">Escalate</span>', '<span class="btng">Escalate</span><span class="btng">Copy</span><span class="btng">Archive</span>'),
        conv + TCONV + '<div style="display:flex;gap:8px;align-items:center;margin-top:16px"><div class="sin" style="flex:1">Write an update… @ to mention</div><span class="ibd">%s</span></div>' % ic('arrowup', 16),
        ''.join('<div style="padding:9px 0;border-bottom:1px solid #F0F0EC"><div class="t2" style="margin:0">%s</div><div style="font-size:14px;margin-top:3px">%s</div></div>' % x for x in [
            ('Company', 'PES Ltd'), ('Who', faces(['PM', 'JS'], 26)), ('Deadline', '<span style="color:#C2327F">22 Sept · 3d late</span>'), ('Priority', 'Medium'), ('Repeats', 'No'), ('Raised by', 'Administrator')]))
    nt = notes('A task', 'Director · 3 of 12', [
        'The dark header shrinks: back, the code and ⋯ on one line, the name, the facts as pills, then <b>two buttons — Complete and Escalate</b>. Copy, Archive, Delete and the rest move behind ⋯ into a sheet (today they wrap into three rows).',
        'The fields the desk shows in its side panel become a <b>Details</b> tab.',
        'The update box sticks to the bottom above the footer, with the quick replies sliding above it.'], [
        'Two columns: the task and its conversation on the left, Details on the right — the desk’s side panel, narrower.',
        'All the header buttons fit on one line again.'], ['Every action, field and tab. Nothing a director can do today is removed.'])
    B.append(board('M_Task.dc.html', 'A task — phone & tablet', [nt, phone(ph, 'Tasks', 'Phone · the conversation'), phone(det, 'Tasks', 'Phone · ⋯ opens the other actions', overlay=sheet), tablet(tb, 'Tasks')]))


TCONV = ''.join(
    '<div style="display:flex;flex-direction:column;align-items:%s;gap:4px;margin-top:12px"><span style="font-size:11px;color:#8E9197">%s</span><span class="bub" style="%s">%s</span></div>' % (
        'flex-end' if me else 'flex-start', who, 'background:#111214;color:#fff' if me else 'background:#F3F3F1', m)
    for me, who, m in [(False, 'Mr Jitesh Solanki · 23 Sept 10:12', 'Vendor demo moved to Thursday — they want the chart of accounts first.'),
                       (True, 'Mr Pulin Manek · 23 Sept 11:40', 'Send them last year’s CoA from DSC, it is the cleanest.'),
                       (False, 'Mr Jitesh Solanki · 24 Sept 09:05', 'Sent. Also asked for the price per user for 25 seats.'),
                       (True, 'Administrator · 24 Sept 16:22', 'Please book the room for the demo and add Kavita.'),
                       (False, 'Mr Jitesh Solanki · Today 08:47', 'Booked for Thursday 10:00. Kavita confirmed.')])


# ─────────────────────────────── 4 · New task ───────────────────────────────
def newtask():
    f = lambda l, v: '<div class="fl"><span class="fll">%s</span>%s</div>' % (l, v)
    body = ('<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #E4E4E0;background:#fff"><span style="font-size:15px;color:#55585E">Cancel</span><span style="font-size:15px;font-weight:600">New task</span><span class="btnd" style="height:36px;font-size:13px">Save</span></div>'
            '<div class="pg" style="gap:16px;padding-top:16px">'
            '<div style="font-size:24px;letter-spacing:-0.02em;color:#8E9197;border-bottom:1px solid #E4E4E0;padding-bottom:10px">What needs doing?</div>'
            + f('Company', chips(['*PES Ltd!', 'MES Ltd!', 'DSC Ltd!', 'Furaha!', 'More!']))
            + f('Who', '<div class="fbx" style="gap:6px">%s<span class="t2" style="margin:0">Mr Jitesh Solanki +1</span><span style="margin-left:auto;color:#8E9197">%s</span></div>' % (faces(['JS', 'PM'], 26), ic('plus', 15)))
            + f('Deadline', chips(['Today!', '*Tomorrow!', 'Fri 3 Oct!', 'Pick a date!']))
            + f('Priority', seg(['Low', 'Medium', 'High', 'Critical'], 1))
            + f('Description', '<div class="fbx" style="height:92px;align-items:flex-start;padding-top:12px;color:#8E9197">Add the detail, or speak it %s</div>' % ic('mic', 14))
            + '<div class="fbx" style="justify-content:space-between;color:#55585E">More — repeat, category, proof needed<span>%s</span></div></div>' % ic('down', 14))
    tb = ('<div style="display:flex;justify-content:center;padding-top:30px"><div class="wc" style="width:600px;padding:0;overflow:hidden">%s</div></div>') % body.replace('class="pg"', 'class="pg" style="padding-bottom:20px"')
    nt = notes('New task', 'Director · 4 of 12', [
        'Opens full screen with Cancel · New task · Save at the top, so the keyboard never covers the Save button.',
        'Company, deadline and priority are big tappable chips instead of dropdowns; the rarely-used fields fold under “More”.',
        'Who: the same picker, limited to people in your companies.'], [
        'The same form as a 600px card in the middle of the screen.'], ['Every field the desk form has.'])
    B.append(board('M_NewTask.dc.html', 'New task — phone & tablet', [nt, phone(body, 'Tasks', 'Phone · no footer while writing', footer=False), tablet(tb, 'Tasks')]))


# ─────────────────────────────── 5 · Calendar ───────────────────────────────
def calendar():
    week = ''.join('<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 0;border-radius:12px;%s"><span style="font-size:11px;color:%s">%s</span><span style="font-size:16px">%s</span><span style="display:flex;gap:2px;height:5px">%s</span></div>' % (
        'background:#111214;color:#fff' if d == '25' else '', '#A3A6AB' if d == '25' else '#8E9197', w, d, ''.join('<span class="d" style="width:5px;height:5px;background:%s"></span>' % c for c in cs))
        for w, d, cs in [('M', '22', [LATE]), ('T', '23', []), ('W', '24', [BLUE]), ('T', '25', [LATE, BLUE]), ('F', '26', [SOON, SOON]), ('S', '27', []), ('S', '28', [])])
    ev = lambda t, ti, sub, c: '<div style="display:grid;grid-template-columns:52px 4px 1fr;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #F0F0EC"><span style="font-size:13px;color:#55585E">%s</span><span style="width:4px;height:36px;border-radius:2px;background:%s"></span><div><div class="t1">%s</div><div class="t2">%s</div></div></div>' % (t, c, ti, sub)
    agenda = ('<div class="wc"><div class="wct">Today · Fri 25 Sept<span>2 things</span></div>%s%s</div>'
              '<div class="wc"><div class="wct">Sat 26 Sept<span>2 things</span></div>%s%s</div>') % (
        ev('All day', '6 Months Projection Plan', 'TG-001 · task deadline', LATE), ev('15:00', 'PES board review', 'Boardroom · 4 guests · Google Meet', BLUE),
        ev('All day', 'Bank and TRA Machine Reconciliation', 'CC-002 · task deadline', SOON), ev('All day', 'CCTV, Fridge, Storage, Chillers', 'VI-006 · task deadline', SOON))
    summ = ('<div class="dk rings"><div class="ct"><span>Next 7 days · Fri 25 – Thu 1 Oct</span>%s</div><div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px"><div><span class="bigs">5</span><span class="u">coming up</span><div style="font-size:11px;color:#A3A6AB;margin-top:8px">0 today · 0 need invites</div></div>'
            '<div style="display:flex;gap:8px;align-items:flex-end">%s</div></div></div>') % (dots(2), ''.join(
        '<div style="display:flex;flex-direction:column;align-items:center;gap:5px"><span style="width:12px;height:%dpx;border-radius:4px;background:%s"></span><span style="font-size:10px;color:%s">%s</span></div>' % (h, LATE if h > 8 else '#3A3C40', '#F2F2F0' if i == 0 else '#8E9197', d)
        for i, (d, h) in enumerate(zip('FSSMTWT', [26, 40, 6, 6, 18, 6, 6]))))
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Calendar</h1><span class="ch">Today</span></div>%s'
          '<div style="display:flex;gap:8px">%s</div>%s<div style="display:flex;gap:2px;background:#fff;border-radius:16px;padding:4px">%s</div>%s</div>') % (
        chips(['Companies', 'Types', 'More']), seg(['Agenda', 'Month', 'Week', 'Day'], 0).replace('class="sg"', 'class="sg" style="flex:1"'), summ, week, agenda)
    evs = ('<div class="scrim"></div><div class="sh" style="padding:0 18px 22px"><div class="grab"></div>'
           '<div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 4px"><span class="lp"><span class="d" style="background:%s"></span>Meeting</span><span class="ib" style="width:34px;height:34px">%s</span></div>'
           '<div style="font-size:24px;letter-spacing:-0.02em">PES board review</div><div class="t2" style="font-size:13px">Fri 25 Sept · 15:00 – 16:00</div>'
           '<div style="display:flex;flex-direction:column;gap:0;margin-top:12px">%s</div>'
           '<div style="display:flex;gap:8px;margin-top:14px"><span class="btn" style="flex:1">%sShare</span><span class="btnd" style="flex:1.4">%sJoin Google Meet</span></div>'
           '<div class="t2" style="text-align:center;margin-top:10px">View only — the administrator changes this event</div></div>') % (
        BLUE, ic('x', 14), ''.join('<div style="display:flex;gap:12px;align-items:center;min-height:46px;border-bottom:1px solid #F0F0EC;font-size:14px"><span style="color:#8E9197">%s</span>%s</div>' % x for x in [
            (ic('pin', 16), 'Boardroom, Oracle House'), (ic('users', 16), faces(['PM', 'JS', 'SP', 'KA'], 26) + '<span class="t2" style="margin:0 0 0 6px">4 guests</span>'), (ic('clip', 16), 'Q3 board pack.pdf'), (ic('bell', 16), '30 minutes before')]), ic('link', 15), ic('play', 14))
    # tablet: month grid
    cells = ''
    days = list(range(1, 31))
    lead = ['31']
    allc = lead + [str(d) for d in days] + ['1', '2', '3', '4']
    evmap = {'3': [('Tax filing', BLUE)], '4': [('VAT return', LATE)], '12': [('Board prep', BLUE)], '18': [('Lease ends', SOON)], '22': [('ERP meeting', LATE)], '25': [('Projection plan', LATE), ('Board review', BLUE)], '26': [('Bank recon', SOON), ('CCTV', SOON)], '30': [('ISO cert', OK)]}
    for i, d in enumerate(allc[:35]):
        out = i == 0 or i > 30
        es = '' if out else ''.join('<div style="font-size:10px;padding:2px 5px;border-radius:5px;background:%s1f;color:#111214;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:2px solid %s">%s</div>' % (c, c, n) for n, c in evmap.get(d, []))
        cells += '<div style="height:128px;border-right:1px solid #F0F0EC;border-bottom:1px solid #F0F0EC;padding:6px;box-sizing:border-box;display:flex;flex-direction:column;gap:3px;%s"><span style="font-size:12px;%s">%s</span>%s</div>' % (
            'background:#FBFBFA' if out else '', 'color:#C4C5C9' if out else ('background:#111214;color:#fff;border-radius:10px;width:22px;height:22px;display:flex;align-items:center;justify-content:center' if d == '25' else ''), d, es)
    grid = '<div class="wc" style="padding:0;overflow:hidden"><div style="display:grid;grid-template-columns:repeat(7,1fr);font-size:11px;color:#8E9197;padding:8px 0;text-align:center;border-bottom:1px solid #F0F0EC">%s</div><div style="display:grid;grid-template-columns:repeat(7,1fr)">%s</div></div>' % (''.join('<span>%s</span>' % x for x in 'MTWTFSS'), cells)
    tb = ('<div class="pgt"><div class="hd"><div style="display:flex;align-items:flex-end;gap:12px"><h1 class="h1t">Calendar</h1></div>%s</div>'
          '<div style="display:flex;gap:8px;align-items:center">%s<span style="flex:1"></span><span class="back">%s</span><span style="font-size:15px;font-weight:500">September 2026</span><span class="back">%s</span><span class="ch">Today</span></div>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s%s</div>%s</div>') % (
        '<span style="display:flex;gap:8px">%s</span>' % chips(['Companies', 'Types', 'More']).replace('class="cr"', 'style="display:flex;gap:8px"'),
        seg(['Agenda', 'Month', 'Week', 'Day'], 1).replace('class="sg"', 'class="sg" style="width:300px"'), ic('left', 15), ic('right', 15),
        '<div class="dk"><div class="ct"><span>Today · Fri 25 Sept</span><span>2 things</span></div><div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">%s</div></div>' % ''.join('<div style="background:#1F2023;border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:center;font-size:13px"><span class="d" style="background:%s"></span><span style="flex:1">%s</span><span style="color:#A3A6AB;font-size:11px">%s</span></div>' % x for x in [(LATE, 'TG-001 · 6 Months Projection Plan', 'deadline'), (BLUE, 'PES board review', '15:00')]),
        summ.replace(dots(2), '<span>5 things</span>'), grid)
    nt = notes('Calendar', 'Director · 5 of 12', [
        '<b>Agenda is the phone’s first view</b> (Month on the desk). A week strip with coloured dots sits above it — tap a day to jump, swipe for the next week.',
        'Today and Next 7 days become one card you swipe. The day labels under the little chart are single letters, so they no longer run into each other.',
        'An event opens as a sheet: when, where, guests, papers, reminder, and Join / Share. It is view-only for a director and says so.'], [
        'Month grid across the full width with events as small coloured bars; Today and Next 7 days side by side above it.',
        'Tapping an event opens the same sheet, centred.'], ['Filters (Companies · Types · More) and all four views.'])
    B.append(board('M_Calendar.dc.html', 'Calendar — phone & tablet', [nt, phone(ph, 'Calendar', 'Phone · Agenda'), phone(ph, 'Calendar', 'Phone · an event', overlay=evs), tablet(tb, 'Calendar')]))


# ─────────────────────────────── 6 · Announcements ───────────────────────────────
def announcements():
    card = lambda who, name, when, title, body, aud, ack, acked: (
        '<div class="wc"><div style="display:flex;gap:10px;align-items:center">%s<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500">%s</div><div class="t2" style="margin:0">%s</div></div><span class="lp">%s</span></div>'
        '<div style="font-size:17px;font-weight:600;letter-spacing:-0.01em;margin:12px 0 6px">%s</div><div style="font-size:14px;line-height:1.5;color:#33363B">%s</div>'
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px"><span class="t2" style="margin:0">%s</span>%s</div></div>') % (
        av(who, 34), name, when, aud, title, body, ack,
        '<span class="lp" style="color:#19A06A">%s Acknowledged</span>' % ic('check', 12) if acked else '<span class="btnd" style="height:36px;font-size:13px">Acknowledge</span>')
    feed = (card('SP', 'Mr Shivam Parmar', 'Administrator · 2h ago', 'Office closed Monday 29 Sept', 'The office is closed for the public holiday. Anything urgent: call the duty phone.', 'Everyone', '41 of 58 read', False)
            + card('PM', 'Mr Pulin Manek', 'Director · Yesterday', 'Quarter-end: numbers by Friday', 'Each company’s managers, please post your Q3 figures on the task by Friday midday.', 'PES Ltd · MES Ltd', '12 of 14 read', True))
    comp = '<div class="wc" style="display:flex;gap:10px;align-items:center">%s<div class="sin" style="flex:1;height:42px">Write an announcement…</div></div>' % av('PM', 34)
    more = (card('SP', 'Mr Shivam Parmar', 'Administrator · Mon 22 Sept', 'New staff portal sign-in', 'You can now sign in with your fingerprint or face. Open Profile → Sign in faster.', 'Everyone', '52 of 58 read', True)
            + card('JS', 'Mr Jitesh Solanki', 'Manager · Fri 19 Sept', 'Stock count Saturday 8:00', 'All Furaha shop staff please be in by 7:45 for the quarterly stock count.', 'Furaha Innovation', '9 of 9 read', True))
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Announcements</h1></div>%s%s%s</div>') % (
        seg([('All', 6), ('To read', 1), ('Mine', 2)], 0), comp, feed)
    tb = ('<div class="pgt"><div class="hd"><h1 class="h1t">Announcements</h1>%s</div><div style="display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;align-items:start"><div style="display:flex;flex-direction:column;gap:12px">%s%s' + more + '</div>'
          '<div class="dk rings"><div class="ct"><span>Reach</span></div><div style="margin-top:10px"><span class="bigs">71%%</span></div><div style="font-size:12px;color:#A3A6AB;margin-top:8px">of people have read the last one</div><div style="display:flex;gap:8px;margin-top:14px"><div class="dtile"><b>6</b><span>this month</span></div><div class="dtile"><b>1</b><span>to read</span></div></div></div></div></div>') % (
        seg([('All', 6), ('To read', 1), ('Mine', 2)], 0).replace('class="sg"', 'class="sg" style="width:300px"'), comp, feed)
    nt = notes('Announcements', 'Director · 6 of 12 · its own page now', [
        'Its own page, straight from the footer (it used to be a tab inside Briefings).',
        'Write one from the box at the top — it opens the same composer full screen, with who it goes to.',
        'Each announcement is a card: who, when, who it went to, the text, how many have read it, and Acknowledge.'], [
        'The feed on the left, a small “Reach” card on the right.'], ['Who can post, who it reaches and the acknowledgement.'])
    B.append(board('M_Announcements.dc.html', 'Announcements — phone & tablet', [nt, phone(ph, 'Announcements', 'Phone · the feed'), tablet(tb, 'Announcements')]))


# ─────────────────────────────── 7 · Outbox ───────────────────────────────
def outbox():
    ppl = [('PM', 'Mr Pulin Manek', '12 tasks · 8 overdue · chased 5d ago', LATE), ('JS', 'Mr Jitesh Solanki', '25 tasks · 6 overdue · chased 3h ago', LATE), ('GM', 'Mr Gangadhar Mathankar', '3 tasks · 3 overdue · not chased yet', LATE),
           ('KS', 'Mr Kishan Suchak', '3 tasks · 3 overdue · not chased yet', LATE), ('HS', 'Mr Hriday Solanki', '7 tasks · 1 overdue · not chased yet', SOON), ('VP', 'Mr Vishal Pragji', '13 tasks · not chased yet', OK), ('NV', 'Mr Nayan Vaghela', '2 tasks · 2 overdue', SOON)]
    prow = lambda p, sel=False: '<div style="display:grid;grid-template-columns:8px 36px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 8px;border-radius:14px;%s"><span class="d" style="background:%s"></span>%s<div style="min-width:0"><div class="t1">%s</div><div class="t2">%s</div></div><span style="color:#C4C5C9">%s</span></div>' % (
        'background:#F3F3F1' if sel else '', p[3], av(p[0], 36), p[1], p[2], ic('right', 14))
    summ = ('<div class="dk"><div class="ct"><span>Today · Across every company</span>%s</div><div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px"><div><span class="bigs">19</span><span class="u">to chase</span><div style="font-size:11px;color:#A3A6AB;margin-top:8px">0 sent · automatic sending paused</div></div>%s</div></div>') % (dots(2), ring(0, 78, 9, '#19C37D', '#26282C', '0%', 'done'))
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Outbox</h1><span class="ib">%s</span></div>%s%s'
          '<div class="wc" style="padding:6px"><div style="display:flex;gap:8px;padding:6px 6px 8px"><div class="sin" style="flex:1;height:38px;font-size:13px">%sSearch people</div><span class="ch" style="height:38px">All companies%s</span></div>%s</div></div>') % (
        ic('history', 16), seg([('All', 19), ('Reminders', 19), ('Sent', 0)], 0), summ, ic('search', 14), ic('down', 12), ''.join(prow(p) for p in ppl))
    task = lambda c, t, d, col: '<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #F0F0EC;border-radius:12px;font-size:13px"><span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="mo">%s</span> %s</span><span style="color:%s;white-space:nowrap;font-size:12px">%s</span></div>' % (c, t, col, d)
    detail = ('<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px"><span class="back">%sOutbox</span><span class="t2" style="margin:0">1 of 19</span></div>'
              '<div class="pg" style="padding-top:0;gap:14px"><div style="display:flex;gap:12px;align-items:center">%s<div><div style="font-size:20px;font-weight:500;letter-spacing:-0.01em">Mr Pulin Manek</div><div class="t2">Last chased 5d ago · WhatsApp</div></div></div>'
              '<div style="display:flex;gap:8px"><div class="tile"><b>12</b><span>open</span></div><div class="tile"><b style="color:#C2327F">8</b><span>overdue</span></div><div class="tile"><b>0</b><span>due soon</span></div></div>'
              '<div class="fll">In this reminder</div><div style="display:flex;flex-direction:column;gap:6px">%s</div>'
              '<div class="fll">Message — edit anything before it goes</div><div style="border:1px solid #EFEFEB;background:#FAFAF8;border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.5;height:120px;overflow:hidden">Hello Pulin, this is your task reminder — Oracle Consultancy Limited.<br><br>MES Ltd — ISO Certification<br>PES Ltd — Update on WTP costs</div></div>'
              '<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #E4E4E0;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">'
              '<span class="btn">%sCopy &amp; done</span><span class="btn">Mark done</span><span class="btn">%sWhatsApp</span><span class="btnd">%sSend email</span></div>') % (
        ic('left', 16), av('PM', 48), ''.join(task(*x) for x in [('ME-012', 'ISO Certification — full details', '2d late', '#C2327F'), ('PE-029', 'Update on WTP costs', 'No date', '#8E9197'), ('DS-010', 'Sale of stock from warehouse', 'No date', '#8E9197'), ('ME-019', 'Payoffs — finance routing', '2d late', '#C2327F')]),
        ic('copy', 15), ic('wa', 15), ic('mail', 15))
    tb = ('<div class="pgt"><div class="hd"><h1 class="h1t">Outbox</h1><span style="display:flex;gap:8px">%s<span class="btn" style="height:40px">%sSent log</span></span></div>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s<div class="dk hatch"><div class="ct"><span>Automatic sending</span><span class="dp" style="color:#F5B94E">● Paused</span></div><div style="margin-top:8px">%s</div></div></div>'
          '<div style="display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;height:650px"><div class="wc" style="padding:6px;overflow:hidden"><div class="sin" style="margin:6px;height:38px;font-size:13px">%sSearch people</div>%s</div>'
          '<div class="wc" style="padding:0;overflow:hidden;position:relative">%s</div></div></div>') % (
        seg([('All', 19), ('Reminders', 19), ('Sent', 0)], 0).replace('class="sg"', 'class="sg" style="width:280px"'), ic('history', 15), summ.replace(dots(2), ''),
        ''.join('<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid #222428"><span style="color:#C9CBCF">%s</span><span style="color:#8E9197">off</span></div>' % x for x in ['Task reminders to staff', 'Overdue-task safety net', 'Document &amp; permit renewals', 'Weekly Director Brief']),
        ic('search', 14), ''.join(prow(p, i == 0) for i, p in enumerate(ppl)),
        detail.replace('<span class="back">%sOutbox</span><span class="t2" style="margin:0">1 of 19</span>' % ic('left', 16), '<span></span>'))
    nt = notes('Outbox', 'Director · 7 of 12', [
        'The list of people comes first; <b>tapping a person opens their reminder full screen</b>, with a back arrow and “1 of 19”.',
        'Today and Automatic sending become one swiped card.',
        'The four actions sit in a 2 × 2 bar pinned to the bottom, so they never scroll away: Copy &amp; done · Mark done · WhatsApp · Send email.',
        'Sent log sits behind the clock icon next to the title.'], [
        'Both dark cards side by side, then the list (300px) beside the open reminder — the desk layout, narrower.'], ['Your companies’ people only, your own name on the message.'])
    B.append(board('M_Outbox.dc.html', 'Outbox — phone & tablet', [nt, phone(ph, 'Outbox', 'Phone · who to chase'), phone(detail, 'Outbox', 'Phone · one reminder open'), tablet(tb, 'Outbox')]))


# ─────────────────────────────── 8 · Companies ───────────────────────────────
CO = [('PE', 'PES Ltd', 11, 2, 13, 'Watch', SOON), ('ME', 'MES Ltd', 14, 4, 22, 'At risk', LATE), ('DS', 'DSC Ltd', 9, 1, 18, 'Watch', SOON), ('CC', 'Furaha Innovation Ltd', 12, 3, 31, 'At risk', LATE),
      ('TG', 'Terra Green Ltd', 4, 0, 6, 'Healthy', OK), ('OC', 'Oracle Consultancy Ltd', 8, 0, 9, 'Healthy', OK), ('VI', 'V1 Intertrade Limited', 5, 1, 7, 'Watch', SOON), ('PP', 'Pamoja Plus', 2, 0, 3, 'Healthy', OK)]


def logo(p, s=40):
    return '<span style="width:%dpx;height:%dpx;border-radius:12px;background:#FDF1DC;color:#B7700A;font-weight:600;font-size:%dpx;display:flex;align-items:center;justify-content:center;flex-shrink:0">%s</span>' % (s, s, s // 3, p)


def companies():
    crow = lambda c: '<div style="display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 2px;border-bottom:1px solid #F0F0EC">%s<div style="min-width:0"><div class="t1">%s</div><div class="t2">%d open · %s%d people</div></div><span class="lp"><span class="d" style="background:%s"></span>%s</span></div>' % (
        logo(c[0]), c[1], c[2], '<span style="color:#C2327F">%d late</span> · ' % c[3] if c[3] else '', c[4], c[6], c[5])
    summ = ('<div class="dk rings"><div class="ct"><span>Your companies</span>%s</div><div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px"><div><span class="bigs">14</span><span class="u">companies</span></div>'
            '<div style="display:flex;gap:14px;font-size:12px;color:#A3A6AB"><span><b style="color:#F07BBE;font-size:18px;font-weight:400">2</b> at risk</span><span><b style="color:#F5B94E;font-size:18px;font-weight:400">3</b> watch</span><span><b style="color:#5BE0A5;font-size:18px;font-weight:400">9</b> fine</span></div></div></div>') % dots(2)
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Companies</h1></div><div class="sin">%sFind a company</div>%s<div class="wc" style="padding:2px 14px">%s</div></div>') % (ic('search', 16), summ, ''.join(crow(c) for c in CO))
    card = lambda c: '<div class="wc"><div style="display:flex;gap:12px;align-items:center">%s<div style="flex:1;min-width:0"><div class="t1" style="font-size:15px">%s</div><div class="t2">Task codes %s-…</div></div><span class="lp"><span class="d" style="background:%s"></span>%s</span></div><div style="display:flex;gap:8px;margin-top:14px"><div class="tile"><b>%d</b><span>open</span></div><div class="tile"><b style="color:%s">%d</b><span>late</span></div><div class="tile"><b>%d</b><span>people</span></div></div></div>' % (
        logo(c[0], 44), c[1], c[0], c[6], c[5], c[2], '#C2327F' if c[3] else '#111214', c[3], c[4])
    tb = ('<div class="pgt"><div class="hd"><h1 class="h1t">Companies</h1><div class="sin" style="width:280px">%sFind a company</div></div>%s<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">%s</div></div>') % (
        ic('search', 16), summ.replace(dots(2), ''), ''.join(card(c) for c in CO[:8]))
    nt = notes('Companies', 'Director · 8 of 12', [
        'One card of totals, then every company as a row: initials or logo, name, open · late · people, and its risk as a pill.',
        'The search box sits under the title.'], [
        'Companies become cards, two across, each with open · late · people.'], ['Only your companies. No Add company, no Departments / Sites / Roles tabs (view-only).'])
    B.append(board('M_Companies.dc.html', 'Companies — phone & tablet', [nt, phone(ph, 'Companies', 'Phone · every company'), tablet(tb, 'Companies')]))


def company():
    hero = ('<div class="dk rings" style="border-radius:0 0 22px 22px;margin:0 -16px;padding:14px 16px 0">'
            '<div style="display:flex;justify-content:space-between;align-items:center"><span class="back" style="color:#C9CBCF">%sCompanies</span><span class="fb" style="width:36px;height:36px">%s</span></div>'
            '<div style="display:flex;gap:14px;align-items:center;margin:14px 0">%s<div style="min-width:0"><div style="font-size:26px;letter-spacing:-0.025em;line-height:1">PES Ltd</div><div style="font-size:12px;color:#A3A6AB;margin-top:6px">Task codes PE-… · 11 open · 13 people</div></div></div>'
            '<div style="display:flex;gap:8px;margin-bottom:14px"><span class="dp" style="color:#F5B94E">● Watch · 2 late</span><span class="dp">%sOpen in Tasks</span><span class="dp">%sFiles</span></div>'
            '<div class="tabs" style="border-color:#26282C;color:#8E9197"><span class="on" style="color:#F2F2F0;box-shadow:inset 0 -2px 0 #F2F2F0">Overview</span><span>Profile</span><span>Tasks 11</span><span>Timeline</span><span>Org</span></div></div>') % (
        ic('left', 16), ic('more', 16), logo('PE', 56), ic('list', 12), ic('folder', 12))
    tiles = '<div style="display:flex;gap:8px">%s</div>' % ''.join('<div class="tile" style="background:#fff"><b style="color:%s">%s</b><span>%s</span></div>' % x for x in [('#111214', '11', 'open'), ('#C2327F', '2', 'overdue'), ('#111214', '13', 'people'), ('#111214', '65', 'files')])
    tasks_c = '<div class="wc"><div class="wct">Open tasks<span>All 11 →</span></div><div class="cr" style="margin:10px -16px 4px;padding:0 16px">%s</div>%s</div>' % (
        ''.join('<span class="lp" style="height:30px;%s">%s</span>' % x for x in [('background:#FDEBF4;color:#C2327F', 'Overdue 2'), ('background:#FEF3E0;color:#B7700A', 'Due soon 0'), ('', 'Stalled 0'), ('', 'No deadline 9')]),
        ''.join(row(t[0], t[1], '<span class="mo">%s</span> · %s' % (t[2], t[3]), t[5]) for t in [T[1], T[7], T[8]]))
    gov = '<div class="wc pdots"><div class="wct">Governance<span>Profile tab</span></div>%s</div>' % ''.join('<div style="display:grid;grid-template-columns:110px 1fr;font-size:13px;padding:9px 0;border-bottom:1px solid #F0F0EC"><span style="color:#8E9197">%s</span><span>%s</span></div>' % x for x in [('Cap table', '2 holders'), ('Signatories', '2 signatories'), ('Resolutions', '2 resolutions')])
    ph = '<div class="pg">%s%s%s%s</div>' % (hero, tiles, tasks_c, gov)
    tb = ('<div class="pgt">%s%s<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s<div style="display:flex;flex-direction:column;gap:16px">%s<div class="wc"><div class="wct">People<span>13</span></div>%s</div></div></div>' + TIMELINE + '</div>') % (
        hero.replace('border-radius:0 0 22px 22px;margin:0 -16px;', 'border-radius:20px;'), tiles.replace('<div class="tile" style="background:#fff">', '<div class="tile" style="background:#fff;padding:14px 16px">'), tasks_c, gov,
        ''.join('<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #F0F0EC">%s<div><div class="t1">%s</div><div class="t2">%s</div></div></div>' % (av(a, 30), b, c) for a, b, c in [('PM', 'Mr Pulin Manek', 'Director'), ('JS', 'Mr Jitesh Solanki', 'General Manager'), ('KA', 'Ms Kavita A.', 'Accounts')]))
    nt = notes('A company', 'Director · 9 of 12', [
        'The header holds the name, the risk pill and two doors (Open in Tasks, Files); the tabs slide sideways at its foot.',
        'The five number tiles become four in one row (open · overdue · people · files) — each still a door.',
        'Cards stack in the desk’s order: Open tasks, Governance (now readable), People, Timeline.'], [
        'Header full width, the four tiles in a row, then two columns of cards.'], ['Profile stays locked; Tasks tab has full powers.'])
    B.append(board('M_Company.dc.html', 'A company — phone & tablet', [nt, phone(ph, 'Companies', 'Phone · Overview'), tablet(tb, 'Companies')]))


TIMELINE = '<div class="wc"><div class="wct">Timeline<span>this week</span></div>%s</div>' % ''.join(
    '<div style="display:grid;grid-template-columns:90px 10px 1fr;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #F0F0EC;font-size:13px"><span class="t2" style="margin:0">%s</span><span class="d" style="background:%s"></span><span>%s</span></div>' % x
    for x in [('Today 08:47', BLUE, '<b>PE-026 ERP meeting</b> — Jitesh: booked for Thursday 10:00'), ('Yesterday', OK, '<b>PE-031 Office rent</b> completed by Mr Nayan Vaghela'), ('Wed 23', LATE, '<b>PE-026</b> passed its deadline'),
              ('Tue 22', BLUE, '<b>PE-029 WTP costs</b> — new update from Mr Pulin Manek'), ('Mon 21', SOON, '<b>Trade licence</b> renewal due in 30 days')])


# ─────────────────────────────── 9 · People ───────────────────────────────
PP = [('JS', 'Mr Jitesh Solanki', 'General Manager · Furaha', 25, 6), ('PM', 'Mr Pulin Manek', 'Director · Oracle Consultancy', 12, 8), ('GM', 'Mr Gangadhar Mathankar', 'Engineer · MES Ltd', 3, 3),
      ('HS', 'Mr Hriday Solanki', 'Manager · V1 Intertrade', 7, 1), ('VP', 'Mr Vishal Pragji', 'Accounts · DSC Ltd', 13, 0), ('KS', 'Mr Kishan Suchak', 'Operations · MES Ltd', 3, 3), ('AS', 'Mr Amal Somaiya', 'Terra Green Ltd', 3, 1), ('NV', 'Mr Nayan Vaghela', 'Sales · PES Ltd', 2, 2), ('KA', 'Ms Kavita A.', 'Accounts · PES Ltd', 4, 0)]


def people():
    prow = lambda p: '<div style="display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 2px;border-bottom:1px solid #F0F0EC">%s<div style="min-width:0"><div class="t1">%s</div><div class="t2">%s</div></div><div class="rt"><div>%d open</div><div style="color:%s;font-size:11px">%s</div></div></div>' % (
        av(p[0], 40), p[1], p[2], p[3], '#C2327F' if p[4] else '#19A06A', '%d late' % p[4] if p[4] else 'on track')
    summ = ('<div class="dk rings"><div class="ct"><span>Directory · 34 people · 14 companies</span>%s</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><div><span class="bigs">34</span><span class="u">active</span><div style="font-size:11px;color:#A3A6AB;margin-top:8px">4 without a portal login</div></div>'
            '<div style="display:flex;gap:10px">%s%s</div></div></div>') % (dots(2), ring(88, 66, 8, '#19C37D', '#26282C', '30', 'portal'), ring(20, 66, 8, '#E0479E', '#26282C', '7', 'busy'))
    bar = '<div class="sbar"><div class="sin">%sSearch people</div><div class="cr" style="margin:0;padding:0">%s</div></div>' % (ic('search', 16), ''.join('<span class="ch%s" style="height:32px">%s</span>' % (' cho' if i == 0 else '', x) for i, x in enumerate(['All 34', 'Overloaded 7', 'No contact 4', 'Probation 0'])))
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">People</h1></div>%s%s<div class="wc" style="padding:2px 14px">%s</div></div><div class="fade"></div>%s') % (
        chips(['All companies', 'All types', 'All locations']), summ, ''.join(prow(p) for p in PP), bar)
    pcard = lambda p: '<div class="wc" style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:18px 12px">%s<div class="t1" style="font-size:14px">%s</div><div class="t2" style="margin:0">%s</div><div style="display:flex;gap:6px;margin-top:6px"><span class="lp">%d open</span>%s</div></div>' % (
        av(p[0], 56), p[1], p[2], p[3], '<span class="lp" style="background:#FDEBF4;color:#C2327F">%d late</span>' % p[4] if p[4] else '')
    tb = ('<div class="pgt"><div class="hd"><div style="display:flex;align-items:flex-end;gap:12px"><h1 class="h1t">People</h1><span style="display:flex;gap:8px">%s</span></div>%s</div>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s<div class="dk hatch"><div class="ct"><span>Needs attention · 15</span></div><div style="display:flex;gap:8px;margin-top:12px"><div class="dtile"><b>7</b><span>carry 5+ open tasks</span></div><div class="dtile"><b>4</b><span>no contact details</span></div><div class="dtile"><b>0</b><span>probation ending</span></div></div></div></div>'
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">%s</div></div><div class="fade"></div>%s') % (
        chips(['All companies', 'All types']).replace('class="cr"', 'style="display:flex;gap:8px"'), seg(['Browse', ('Attention', 15)], 0).replace('class="sg"', 'class="sg" style="width:220px"'),
        summ.replace(dots(2), ''), ''.join(pcard(p) for p in PP[:9]), bar.replace('class="sbar"', 'class="sbar" style="left:60px;right:60px;flex-direction:row;align-items:center"').replace('<div class="sin">', '<div class="sin" style="flex:1">'))
    nt = notes('People', 'Director · 10 of 12', [
        'Directory and Needs attention become one swiped card; the two rings shrink to 66px.',
        'People become rows: face, name, role · company, open tasks and how many are late.',
        'Search and the quick filters float above the footer, as on Tasks.'], [
        'Cards three across; both dark cards side by side.'], ['Your companies’ people only; private details stay hidden.'])
    B.append(board('M_People.dc.html', 'People — phone & tablet', [nt, phone(ph, 'People', 'Phone · the directory'), tablet(tb, 'People')]))


def person():
    hero = ('<div class="wc st-paper" style="border-radius:0 0 22px 22px;margin:0 -16px;padding:14px 16px 16px">'
            '<div style="display:flex;justify-content:space-between;align-items:center"><span class="back">%sPeople</span><span class="ib" style="width:36px;height:36px">%s</span></div>'
            '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;margin-top:6px">%s<div style="font-size:24px;letter-spacing:-0.02em">Mr Jitesh Solanki</div><div class="t2" style="margin:0">General Manager · Furaha Innovation Ltd</div>'
            '<div style="display:flex;gap:10px;margin-top:8px">%s</div></div></div>') % (
        ic('left', 16), ic('more', 16), av('JS', 76), ''.join('<span style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;color:#55585E"><span class="ib" style="width:48px;height:48px;border-radius:24px;background:#F3F3F1;border:0">%s</span>%s</span>' % (ic(i, 18), l) for i, l in [('phone', 'Call'), ('wa', 'WhatsApp'), ('mail', 'Email'), ('chat', 'Chat')]))
    body = ('<div class="tabs"><span class="on">Overview</span><span>Tasks 25</span><span>Files 4</span><span>History</span></div>'
            '<div class="dk rings"><div class="ct"><span>Workload</span><span>25 open</span></div><div style="display:flex;gap:10px;margin-top:10px"><div class="dtile"><b style="color:#F07BBE">6</b><span>late</span></div><div class="dtile"><b style="color:#F5B94E">2</b><span>due soon</span></div><div class="dtile"><b>17</b><span>on track</span></div></div></div>'
            '<div class="wc"><div class="wct">Role &amp; companies</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">%s</div><div class="t2" style="margin-top:10px">Reports to Mr Pulin Manek</div></div>') % ''.join('<span class="lp">%s</span>' % x for x in ['Furaha Innovation', 'DSC Ltd', 'V1 Intertrade'])
    ph = '<div class="pg">%s%s</div>' % (hero, body)
    contact = '<div class="wc" style="margin-top:14px"><div class="wct">Contact</div>%s</div>' % ''.join('<div style="padding:9px 0;border-bottom:1px solid #F0F0EC"><div class="t2" style="margin:0">%s</div><div style="font-size:14px;margin-top:3px">%s</div></div>' % x for x in [('Phone', '+255 754 000 111'), ('WhatsApp', '+255 754 000 111'), ('Email', 'jitesh@furaha.co.tz'), ('Works at', 'Mikocheni office'), ('Started', 'March 2021')])
    tb = ('<div class="pgt" style="display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start"><div>%s' + contact + '</div><div style="display:flex;flex-direction:column;gap:14px">%s<div class="wc"><div class="wct">Open tasks<span>25</span></div>%s</div></div></div>') % (
        hero.replace('border-radius:0 0 22px 22px;margin:0 -16px;', 'border-radius:20px;'), body, ''.join(row(t[0], t[1], '<span class="mo">%s</span> · %s' % (t[2], t[3]), t[5]) for t in T[:5]))
    nt = notes('A person', 'Director · 11 of 12', [
        'The face, name and role centred at the top; <b>Call · WhatsApp · Email · Chat</b> as four big round buttons (the desk’s band of buttons).',
        'Tabs slide under it: Overview · Tasks · Files · History.',
        'Workload becomes three tiles on a dark card.'], [
        'The person on the left (280px), their workload, companies and open tasks on the right.'], ['No private details (ID, passport, address) and no editing for a director.'])
    B.append(board('M_Person.dc.html', 'A person — phone & tablet', [nt, phone(ph, 'People', 'Phone · Overview'), tablet(tb, 'People')]))


# ─────────────────────────────── 10 · Files ───────────────────────────────
def files():
    F = [('pdf', 'Oracle-Tax-Clearance_EXP.pdf', 'Oracle Consultancy · 1.2 MB', 'expired', LATE), ('img', 'Daniel Nida Card.jpg', 'Mr Daniel · 340 KB', 'expired', LATE), ('pdf', 'V1_Plant-Import-Permit.pdf', 'V1 Intertrade · 820 KB', 'expired', LATE),
         ('doc', 'PES board pack Q3.docx', 'PES Ltd · 2.4 MB', 'Tue', OK), ('pdf', 'MES ISO scope letter.pdf', 'MES Ltd · 410 KB', 'Mon', OK), ('xls', 'DSC debtors Sept.xlsx', 'DSC Ltd · 96 KB', '22 Sept', OK)]
    F2 = [('pdf', 'PES Trade Licence 2026.pdf', 'PES Ltd · 640 KB', 'Oct 30', SOON), ('img', 'Site photo — mesh line.jpg', 'MES Ltd · 2.1 MB', '19 Sept', OK), ('pdf', 'Lease — Oracle House.pdf', 'Oracle Consultancy · 1.8 MB', 'Mar 2027', OK),
          ('doc', 'Job descriptions v3.docx', 'Oracle Consultancy · 88 KB', '17 Sept', OK), ('xls', 'Furaha stock count.xlsx', 'Furaha Innovation · 140 KB', '15 Sept', OK), ('pdf', 'TRA certificate DSC.pdf', 'DSC Ltd · 300 KB', 'Dec 2026', OK),
          ('pdf', 'Insurance — vehicles.pdf', 'PES Ltd · 1.1 MB', 'Nov 12', SOON), ('img', 'Passport — J Solanki.jpg', 'Mr Jitesh Solanki · 900 KB', '2029', OK)]
    col = {'pdf': ('#FDEBF4', '#C2327F'), 'img': ('#E4F7EE', '#19A06A'), 'doc': ('#E6F1FD', '#2490EF'), 'xls': ('#E4F7EE', '#19A06A')}
    frow = lambda f: '<div style="display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 2px;border-bottom:1px solid #F0F0EC"><span style="width:40px;height:40px;border-radius:11px;background:%s;color:%s;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;text-transform:uppercase">%s</span><div style="min-width:0"><div class="t1">%s</div><div class="t2">%s</div></div><span class="rt" style="color:%s">%s</span></div>' % (
        col[f[0]][0], col[f[0]][1], f[0], f[1], f[2], '#C2327F' if f[3] == 'expired' else '#8E9197', f[3])
    folders = chips(['*All files 194!', 'Recent!', 'Needs renewal 20!', 'PES Ltd!', 'MES Ltd!'])
    summ = ('<div class="dk"><div class="ct"><span>All files · 173 MB stored</span>%s</div><div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px"><div><span class="bigs">194</span><span class="u">files</span></div><div style="display:flex;gap:12px;font-size:11px;color:#A3A6AB;text-align:right">%s</div></div>'
            '<div style="display:flex;gap:12px;font-size:11px;margin-top:10px"><span style="color:#F07BBE">16 expired</span><span style="color:#F5B94E">4 due soon</span><span style="color:#A3A6AB">0 loose</span></div></div>') % (
        dots(2), ''.join('<div><div style="font-size:18px;color:#F2F2F0">%s</div>%s</div>' % x for x in [('160', 'PDF'), ('26', 'pictures'), ('8', 'Word')]))
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Files</h1><span class="ib">%s</span></div><div class="sin">%sSearch every file and folder</div>%s%s<div class="wc" style="padding:2px 14px">%s</div></div>') % (
        ic('grid', 16), ic('search', 16), summ, folders, ''.join(frow(f) for f in F))
    prev = ('<div style="background:#1C1D20;position:absolute;inset:0;display:flex;flex-direction:column">'
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;color:#F2F2F0"><span class="back" style="color:#C9CBCF">%sFiles</span><span style="font-size:13px">1 of 194</span></div>'
            '<div style="flex:1;margin:0 16px;border-radius:14px;background:#fff;display:flex;flex-direction:column;gap:8px;padding:22px 18px;box-sizing:border-box">%s</div>'
            '<div style="padding:14px 16px;color:#F2F2F0"><div style="font-size:16px;font-weight:500">Oracle-Tax-Clearance_EXP.pdf</div><div style="font-size:12px;color:#A3A6AB;margin:4px 0 12px">Oracle Consultancy · Tax · expired 633 days ago · 1.2 MB</div>'
            '<div style="display:flex;gap:8px"><span class="btng" style="flex:1;height:44px">%sShare</span><span class="btnw" style="flex:1.3;height:44px">%sDownload</span></div></div></div>') % (
        ic('left', 16), ''.join('<span style="height:%dpx;border-radius:3px;background:#ECECE8;width:%d%%"></span>' % (h, w) for h, w in [(14, 60), (8, 90), (8, 85), (8, 92), (8, 70), (30, 100), (8, 88), (8, 80), (8, 94), (8, 60), (40, 100), (8, 75)]), ic('link', 15), ic('download', 15))
    tb = ('<div class="pgt"><div class="hd"><h1 class="h1t">Files</h1><div class="sin" style="width:320px">%sSearch every file and folder</div></div>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s<div class="dk hatch"><div class="ct"><span>Needs renewal · soonest first</span><span>20 due</span></div>%s</div></div>'
          '<div style="display:grid;grid-template-columns:190px minmax(0,1fr);gap:16px"><div class="wc" style="padding:10px">%s</div><div class="wc" style="padding:2px 16px">%s</div></div></div>') % (
        ic('search', 16), summ.replace(dots(2), ''),
        ''.join('<div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 0;border-bottom:1px solid #222428"><span style="color:#F2F2F0">%s</span><span style="color:#F07BBE">%s</span></div>' % x for x in [('Oracle-Tax-Clearance', '633d ago'), ('Daniel Nida Card', '382d ago'), ('V1 Plant Import Permit', '336d ago')]),
        ''.join('<div style="display:flex;align-items:center;gap:10px;height:40px;padding:0 10px;border-radius:10px;font-size:13px;%s">%s<span style="flex:1">%s</span><span class="t2" style="margin:0">%s</span></div>' % ('background:#111214;color:#fff' if i == 0 else '', ic('folder', 15), a, b)
                for i, (a, b) in enumerate([('All files', '194'), ('Recent', ''), ('Needs renewal', '20'), ('PES Ltd', '31'), ('MES Ltd', '22'), ('DSC Ltd', '18'), ('Furaha', '40')])),
        ''.join(frow(f) for f in F + F2))
    nt = notes('Files', 'Director · 12 of 12', [
        '“Files Management” shortens to <b>Files</b> on a phone so the title fits; the search box sits under it.',
        'All files and Needs renewal become one swiped card; folders become a sliding row of chips.',
        'Tapping a file opens it full screen with Share and <b>Download</b> at the foot.'], [
        'Folders as a narrow rail on the left, files on the right; the two dark cards side by side.'], ['View and download only — no upload, rename, move or delete for a director.'])
    B.append(board('M_Files.dc.html', 'Files — phone & tablet', [nt, phone(ph, 'Files', 'Phone · the library'), phone('', 'Files', 'Phone · a file open', overlay=prev), tablet(tb, 'Files')]))


# ─────────────────────────────── 11 · Chat ───────────────────────────────
def chat():
    th = [('JS', 'Mr Jitesh Solanki', 'Will send the quotation by 5', '14:02', 2), ('SP', 'Mr Shivam Parmar', 'You: ok, noted', '12:40', 0), ('GM', 'MES site team', 'Gangadhar: the mesh operator starts Monday', 'Yesterday', 5), ('HS', 'Mr Hriday Solanki', 'Photo', 'Wed', 0), ('VP', 'Mr Vishal Pragji', 'Debtors report attached', 'Tue', 0)]
    trow = lambda t, sel=False: '<div style="display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 8px;border-radius:14px;%s">%s<div style="min-width:0"><div class="t1">%s</div><div class="t2">%s</div></div><div class="rt"><div class="t2" style="margin:0">%s</div>%s</div></div>' % (
        'background:#F3F3F1' if sel else '', av(t[0], 44), t[1], t[2], t[3], '<span style="display:inline-flex;min-width:20px;height:20px;border-radius:10px;background:#111214;color:#fff;font-size:11px;align-items:center;justify-content:center;margin-top:4px">%d</span>' % t[4] if t[4] else '')
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Chat</h1><span class="ibd">%s</span></div><div class="sin">%sSearch conversations</div><div class="wc" style="padding:6px">%s</div></div>') % (
        ic('pencil', 16), ic('search', 16), ''.join(trow(t) for t in th))
    conv = ('<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border-bottom:1px solid #E4E4E0"><span class="back">%s</span>%s<div><div style="font-size:15px;font-weight:600">Mr Jitesh Solanki</div><div class="t2" style="margin:0">online</div></div></div>'
            '<div style="display:flex;flex-direction:column;gap:8px;padding:14px">%s</div>'
            '<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #E4E4E0;padding:10px 12px;display:flex;gap:8px;align-items:center"><span class="ib" style="border:0;background:#F3F3F1">%s</span><div class="sin" style="flex:1">Message</div><span class="ibd">%s</span></div>') % (
        ic('left', 18), av('JS', 36), ''.join('<div style="display:flex;justify-content:%s"><span class="bub" style="%s">%s</span></div>' % ('flex-end' if me else 'flex-start', 'background:#111214;color:#fff' if me else 'background:#fff', m) for me, m in [
            (False, 'Morning — shelving quotes are in'), (True, 'Great, which is cheaper?'), (False, 'Power Computers, by 12%. The centre shelf is not included though'), (True, 'Get it added and send by 5'), (False, 'Will send the quotation by 5')]), ic('clip', 16), ic('arrowup', 16))
    tb = ('<div class="pgt" style="height:100%%;box-sizing:border-box;padding-bottom:22px"><div style="display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;height:100%%"><div class="wc" style="padding:6px"><div style="padding:8px 8px 10px"><h1 class="h1" style="font-size:30px">Chat</h1></div>%s</div>'
          '<div class="wc" style="padding:0;overflow:hidden;position:relative;background:#F7F7F5">%s</div></div></div>') % (''.join(trow(t, i == 0) for i, t in enumerate(th)), conv.replace('<span class="back">%s</span>' % ic('left', 18), ''))
    nt = notes('Chat', 'Director · with the footer on every page', [
        'The conversation list, then a conversation full screen (the footer steps aside, as it does today) with a back arrow.',
        'The message box sticks to the bottom and rises with the keyboard.'], [
        'Split view: conversations (300px) beside the open one.'], ['Everything — this page is already a phone app; it gains the Studio look only.'])
    B.append(board('M_Chat.dc.html', 'Chat — phone & tablet', [nt, phone(ph, 'Chat', 'Phone · conversations'), phone(conv, 'Chat', 'Phone · one conversation', footer=False), tablet(tb, 'Chat')]))


rules(); home(); tasks(); task(); newtask(); calendar(); announcements(); outbox(); companies(); company(); people(); person(); files(); chat()

# Put them on the canvas as their own page, one under another.
cp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'boards', 'canvas.json')
cv = json.load(open(cp, encoding='utf-8'))
cv['boards'] = {k: v for k, v in cv['boards'].items() if not k.startswith('M_')}
y = 0
for name, w, h, title in B:
    cv['boards'][name] = {'x': 0, 'y': y, 'w': w, 'h': h, 'title': title, 'page': 'mobile', 'is_interactive': False}
    y += h + 120
if not any(p['id'] == 'mobile' for p in cv['pages']):
    cv['pages'].insert(0, {'id': 'mobile', 'name': 'Phone & tablet (directors)'})
json.dump(cv, open(cp, 'w', encoding='utf-8'), ensure_ascii=False)
print('boards', len(B))
