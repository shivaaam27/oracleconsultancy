# Staff on the Studio screens (26 Sept 2026) — the mockup for approval.
# Every board shows the DESK (1440 x 900, drawn at 62%) and a PHONE (393 x 852).
# Content is Mr Hriday Solanki's real work on 26 Sept 2026 (7 open, 1 late,
# 2 due soon, 2 done). What staff may do is what the code allows today
# (portal-permissions.ts defaults for "staff"): see the Rules board.
# Run: python gen/p_staff.py  then  python preview/build_staff.py <out.html>
import os
from kit import ic, AVC, head, tail, write
from mkit import CSS, av, faces, dots, seg, chips, row, phone, bars, OK, SOON, LATE, BLUE, DOT, TXT

B = []
EXTRA = r'''
.desk{width:893px;height:558px;flex-shrink:0;position:relative}
.desk>.cv{width:1440px;height:900px;transform:scale(.62);transform-origin:0 0;background:#0E0F10;border-radius:18px;padding:12px 12px 0;box-sizing:border-box;display:flex;flex-direction:column}
.pgd{flex:1;min-height:0;background:#F3F3F1;border-radius:20px;padding:26px 28px 24px;box-sizing:border-box;display:flex;flex-direction:column;gap:18px;overflow:hidden;position:relative}
.fd{height:64px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 20px;color:#F2F2F0;font-size:13px}
.fdc{display:flex;align-items:center;gap:22px;color:#A3A6AB}
.fdp{display:flex;align-items:center;gap:4px;border:1px solid #2A2C30;background:#1C1D20;border-radius:12px;padding:3px}
.fdn{height:28px;min-width:110px;padding:0 12px;border-radius:9px;background:#2A2C30;color:#fff;display:flex;align-items:center;justify-content:center;gap:7px;font-weight:500}
.fdr{display:flex;justify-content:flex-end;gap:8px;align-items:center}
.fbx{height:36px;min-width:36px;padding:0 10px;border-radius:10px;border:1px solid #2A2C30;background:#141517;display:flex;align-items:center;justify-content:center;gap:6px;color:#C9CBCF;position:relative;box-sizing:border-box}
.dl2{font-size:12px;color:#6E7177;margin-top:10px}
.h56{margin:0;font-size:56px;font-weight:500;letter-spacing:-0.035em;line-height:.9}
.gr3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.tl{display:grid;grid-template-columns:minmax(0,2.2fr) 140px 90px minmax(0,1.6fr) 110px;column-gap:14px;align-items:center;padding:12px 18px;border-top:1px solid #F0F0EC;font-size:13px}
.tlh{font-size:11px;color:#8E9197;text-transform:uppercase;letter-spacing:.06em;border-top:0;padding-bottom:6px}
.btnd{height:34px;padding:0 14px;border-radius:10px;background:#F2F2F0;color:#111214;font-weight:600;font-size:12px;display:inline-flex;align-items:center;gap:6px}
.btng{height:34px;padding:0 12px;border-radius:10px;border:1px solid #34363B;color:#F2F2F0;font-size:12px;display:inline-flex;align-items:center;gap:6px;box-sizing:border-box}
.btnk{height:34px;padding:0 14px;border-radius:10px;background:#111214;color:#fff;font-weight:500;font-size:12px;display:inline-flex;align-items:center;gap:6px}
.btnw{height:34px;padding:0 12px;border-radius:10px;border:1px solid #DEDED9;background:#fff;font-size:12px;display:inline-flex;align-items:center;gap:6px;box-sizing:border-box}
.lk{font-size:11px;color:#8E9197;text-transform:uppercase;letter-spacing:.06em}
.kv{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;font-size:13px}
.kv span:nth-child(odd){color:#6E7177}
.ci{height:44px;border-radius:12px;border:1px solid #DEDED9;background:#fff;display:flex;align-items:center;justify-content:center;gap:7px;font-size:13px;box-sizing:border-box}
.cio{background:#111214;color:#fff;border-color:#111214}
.wk{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.wkd{border-radius:10px;border:1px solid #E4E4E0;padding:6px 0;text-align:center;font-size:11px;color:#6E7177}
.wkd b{display:block;font-size:13px;color:#111214;font-weight:500;margin-top:2px}
.st{display:flex;align-items:flex-start;gap:10px;padding:7px 4px;font-size:13px}
.sto{width:18px;height:18px;border-radius:9px;border:2px dashed #B9BBBF;box-sizing:border-box;flex-shrink:0;margin-top:1px}
.stx{width:18px;height:18px;border-radius:9px;background:#19C37D;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.tabs{display:flex;gap:20px;border-bottom:1px solid #EDEDE9;font-size:13px;color:#8E9197}
.tabs span{height:36px;display:flex;align-items:center;gap:5px}.tabs .on{color:#111214;border-bottom:2px solid #111214;margin-bottom:-1px}
.msg{display:flex;gap:10px;font-size:13px;line-height:1.45}
.new2{height:36px;padding:0 14px;border-radius:10px;background:#F2F2F0;color:#111214;font-weight:600;display:flex;align-items:center;gap:6px}
'''

# Hriday's work (live, 26 Sept 2026).
T = [
    ('late', 'TRA Sales And Reconciliation', 'TG-002', 'Terra Green Ltd', ['JS', 'HS', 'AS'], '2d late', 'Not Started', 'No updates yet'),
    ('soon', '6 Months Projection Plan', 'TG-001', 'Terra Green Ltd', ['HS', 'AS', 'JS'], 'Today', 'Not Started', 'No updates yet'),
    ('soon', 'Bank and TRA Machine Reconciliation', 'CC-002', 'Furaha Innovation Ltd', ['VP', 'HS', 'JS'], 'Tomorrow', 'Not Started', 'Administrator: to update by end of today · 4d'),
    ('none', 'MIS Reports - Weekly', 'TG-017', 'Terra Green Ltd', ['JS', 'HS'], 'No date', 'Not Started', 'No updates yet'),
    ('none', 'MIS Reports - Weekly', 'PE-030', 'PES Ltd', ['JS', 'HS'], 'No date', 'Not Started', 'No updates yet'),
    ('none', 'MIS Reports - Weekly', 'CC-028', 'Furaha Innovation Ltd', ['JS', 'HS'], 'No date', 'Not Started', 'No updates yet'),
    ('none', 'MIS Reports - Weekly', 'DS-046', 'DSC Ltd', ['JS', 'HS'], 'No date', 'Not Started', 'No updates yet'),
]


def desk_footer(page, need=('#E0479E', 'Late', 'TRA Sales And Reconciliation · 2d late'), new=True):
    n = '<span class="new2">%sNew to-do</span>' % ic('plus', 14, 2.4) if new else ''
    return ('<div class="fd"><div style="min-width:0"><div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8E9197"><span style="width:6px;height:6px;border-radius:3px;background:%s"></span>%s<span style="color:#6E7177">1/3</span></div>'
            '<div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">%s</div></div>'
            '<div class="fdc"><span style="display:flex;gap:7px;align-items:center">%sHome</span><span class="fdp"><span style="width:28px;display:flex;justify-content:center">%s</span><span class="fdn">%s%s</span><span style="width:28px;display:flex;justify-content:center">%s</span></span><span style="display:flex;gap:7px;align-items:center">%sProfile</span></div>'
            '<div class="fdr"><span class="fbx">%s</span><span class="fbx">%s<span class="bdg">2</span></span>%s</div></div>') % (
        need[0], need[1], need[2], ic('home', 16), ic('left', 13), page, ic('up', 11), ic('right', 13), ic('user', 16),
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"></path></svg>',
        ic('bell', 15), n)


def desk(inner, page, label):
    return ('<div class="dv"><div class="desk"><div class="cv"><div class="pgd">%s</div>%s</div></div><div class="dl">%s</div></div>') % (inner, desk_footer(page), label)


def staff_phone_footer(page):
    return ('<div class="ft"><span class="fi">%s</span>'
            '<span class="pl"><span class="pla">%s</span><span class="pln">%s%s</span><span class="pla">%s</span></span>'
            '<span style="display:flex;gap:8px"><span class="fb">%s<span class="bdg">2</span></span><span class="new">%s</span></span></div>') % (
        ic('home', 17), ic('left', 14), page, ic('up', 11), ic('right', 14), ic('bell', 16), ic('plus', 16, 2.4))


def sphone(inner, page, label, overlay=''):
    p = phone(inner, page, label, overlay=overlay)
    # swap the director footer for the staff one (bell 2, + = new to-do)
    i = p.index('<div class="ft">'); j = p.index('<div class="hi">')
    return p[:i] + staff_phone_footer(page) + p[j:]


def note(title, tag, lines, extra=''):
    return ('<div class="nt" style="width:320px"><span class="tag">%s</span><h2>%s</h2><ul style="margin-top:14px">%s</ul>%s</div>' %
            (tag, title, ''.join('<li>%s</li>' % x for x in lines), extra))


def sboard(name, title, parts, h=1080):
    def pw(p):
        if 'class="desk"' in p: return 893
        if 'class="ph"' in p: return 393
        return 520 if 'width:520px' in p else 320
    w = 80 + sum(pw(p) for p in parts) + 48 * (len(parts) - 1)
    html = '<div class="bd" style="width:%dpx;height:%dpx">%s</div>' % (w, h, ''.join(parts))
    write(name, head(title, CSS + EXTRA) + html + tail('class Component extends DCLogic { renderVals() { return {}; } }', w=w, h=h))
    B.append(name)


def trow(t, who=True):
    extra = '<div style="margin-top:4px;display:flex;justify-content:flex-end">%s</div>' % faces(t[4][:3], 20) if who else ''
    return row(t[0], t[1], '<span class="mo">%s</span> · %s' % (t[2], t[3]), t[5], False, extra)


def hero_bars(n=7):
    # One bar per open task, as on the owner's Home — few tasks, so wider bars.
    vals = [0.9, 0.75, 0.7, 0.45, 0.45, 0.45, 0.45]
    cols = [LATE, SOON, SOON, '#C9CD3C', '#C9CD3C', '#C9CD3C', '#C9CD3C']
    return bars(vals[:n], cols[:n], 60, 56, 8)


# ───────────────────────────── 0 · The rules ─────────────────────────────
def rules():
    li = lambda xs: ''.join('<li>%s</li>' % x for x in xs)
    nt = ('<div class="nt" style="width:520px"><span class="tag">Staff · the plan</span><h2>Staff on the new screens</h2>'
          '<p style="margin:10px 0 16px;color:#55585E">The same Studio as the owner and directors — Home, Tasks, a task page, Calendar, People — showing only <b>their own work</b>. Nothing a member of staff can do today is lost; nothing they cannot do is added.</p>'
          '<h3>What they can do (as the code allows today)</h3><ul>%s</ul>'
          '<h3>What they cannot</h3><ul>%s</ul>'
          '<h3>Where the old portal pages go</h3><ul>%s</ul></div>') % (
        li(['See and open the tasks they are on or raised — nobody else\'s.',
            'Post an update, attach a file, @mention, message a teammate.',
            'Move a task to In Progress, Under Review (“send for review”) or Blocked — never Completed or Closed.',
            'Complete a task only if <b>they raised it</b>, with a note (and a file where proof is required).',
            'Tick, add and rename subtasks on their tasks.',
            'Check in each day (Present · Remote · Half-day · Sick) and see their week.',
            'Their own to-do list, with a reminder time.',
            'Profile: edit their contact details, send a document, passkeys, password, alerts, install the app.',
            'Read and acknowledge announcements; chat.']),
        li(['Create tasks for others, bulk-edit, repeat rules, copy across companies.',
            'See other people\'s tasks, the Outbox, Insights or the Report.',
            'Edit a task\'s fields (deadline, priority, people) — they ask whoever runs it.',
            'Pin or take down anyone\'s update but their own.']),
        li(['Home → <b>Home</b> (their greeting card, check-in, diary, late work, to-dos).',
            'My tasks (on Home) → <b>Tasks</b>, its own page, like everyone else.',
            'Briefings → meetings in <b>Calendar</b>; announcements as a banner on Home + the Announcements page (until it is rebuilt, the current one).',
            'Directory → <b>People</b>, view-only: their colleagues, call / WhatsApp / email.',
            'Activity → the <b>Updates</b> card on Tasks.',
            'Profile → <b>Profile</b>, rebuilt in the same look.',
            'Chat → stays the current Chat until it is rebuilt.']))
    goto = ('<div class="scrim"></div><div class="sh" style="padding:0 16px 20px">'
            '<div class="grab"></div>'
            '<div style="display:flex;align-items:center;gap:12px;padding:14px 2px 12px;border-bottom:1px solid #F0F0EC">%s'
            '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:600">Mr Hriday Solanki</div><div class="t2">Staff · Senior Accountant</div></div>'
            '<span class="ib" style="font-size:15px">☾</span></div>'
            '<div class="sin" style="margin:12px 0">%sGo to a page</div>'
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">%s</div>'
            '<div style="display:flex;gap:8px;margin-top:12px"><span class="btnw" style="flex:1;justify-content:center;height:44px">%sProfile</span><span class="btnw" style="flex:1;justify-content:center;height:44px;color:#C2327F;border-color:#F5C6DF">Sign out</span></div>'
            '</div>') % (av('HS', 44), ic('search', 15),
                         ''.join('<div style="height:68px;border-radius:14px;%s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:12px">%s%s</div>' % (
                             'background:#111214;color:#fff' if l == 'Home' else 'background:#F3F3F1', ic(i, 17), l)
                             for l, i in [('Home', 'home'), ('Tasks', 'list'), ('Calendar', 'cal'), ('People', 'users'), ('Announce…', 'bell'), ('Chat', 'chat')]),
                         ic('user', 15))
    inner = '<div class="pg"><div class="hd"><h1 class="h1">Home</h1></div><div class="dk rings" style="height:160px"></div></div>'
    sboard('S_Rules.dc.html', 'Staff — the plan', [nt, sphone(inner, 'Home', 'Phone · the Go-to sheet for staff (tap the page name)', overlay=goto)], h=1180)


# ─────────────────────────────── 1 · Home ───────────────────────────────
def home():
    hero = ('<div class="dk contour" style="grid-column:span 2;padding:20px 24px;display:flex;flex-direction:column;min-height:0">'
            '<div style="display:flex;justify-content:space-between;gap:20px"><div style="min-width:0"><div style="font-size:13px;color:#F2F2F0;white-space:nowrap">Good morning, Hriday · Saturday 26 September</div>'
            '<div style="font-size:30px;letter-spacing:-0.025em;margin-top:8px;white-space:nowrap">Your 7 open tasks, at a glance</div>'
            '<span class="dp" style="margin-top:12px">%sLive: Test Announcement — Task Creation Advice<span style="color:#fff;text-decoration:underline;margin-left:4px">Acknowledge</span></span></div>'
            '<div style="display:flex;gap:26px;text-align:right;white-space:nowrap;flex-shrink:0">%s</div></div>'
            '<div style="flex:1"></div>%s<div style="display:flex;gap:18px;margin-top:12px;font-size:12px;color:#C9CBCF">%s<span style="flex:1"></span><span class="btnd">%sHow I did in September</span></div></div>') % (
        ic('bell', 12),
        ''.join('<div><div style="font-size:44px;letter-spacing:-0.04em;line-height:1">%s</div><div style="font-size:12px;color:%s;margin-top:4px">%s</div></div>' % x for x in [('1', '#F07BBE', 'late'), ('2', '#F5B94E', 'due soon'), ('2', '#5BE0A5', 'done this month')]),
        hero_bars(),
        ''.join('<span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:%s"></span>%s</span>' % x for x in [(LATE, 'Late · 1'), (SOON, 'Due soon · 2'), ('#C9CD3C', 'No date · 4')]),
        ic('spark', 13))
    checkin = ('<div class="wc" style="display:flex;flex-direction:column;gap:10px;min-height:0"><div class="wct">Today<span>Sat 26 Sept</span></div>'
               '<div style="font-size:20px;letter-spacing:-0.02em">How are you working today?</div>'
               '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">%s</div>'
               '<div class="wk">%s</div><div style="flex:1"></div><div class="t2" style="margin:0">5 of 5 days this week · your manager can adjust a day</div></div>') % (
        ''.join('<span class="ci">%s</span>' % x for x in ['Present', 'Remote', 'Half-day', 'Sick']),
        ''.join('<span class="wkd">%s<b>%s</b></span>' % (d, v) for d, v in [('Mon', '✓'), ('Tue', '✓'), ('Wed', '✓'), ('Thu', '✓'), ('Fri', '✓'), ('Sat', '·')]))
    diary = ('<div class="dk rings"><div class="ct"><span style="font-size:15px;color:#F2F2F0">Due today</span><span class="sg" style="background:#1F2023;padding:2px"><span class="sgi sgo" style="height:26px;flex:none">Today</span><span class="sgi" style="height:26px;flex:none;color:#C9CBCF">This week</span></span></div>'
             '<div style="display:flex;align-items:baseline;gap:10px;margin:12px 0 14px"><span class="bigs">1</span><span style="color:#C9CBCF;font-size:13px">task due · no meetings</span></div>'
             '<div style="background:#1F2023;border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;font-size:13px"><span class="d" style="background:%s"></span><span style="flex:1">6 Months Projection Plan</span><span class="mo">TG-001</span></div></div>') % SOON
    late = ('<div class="wc"><div class="t2" style="margin:0">Tasks</div><div class="wct" style="font-size:20px;font-weight:500;letter-spacing:-0.02em">Needs you<span>3</span></div>'
            '<div class="t2" style="margin:2px 0 6px">late and due soon · worst first</div>%s</div>') % ''.join(trow(t, False) for t in T[:3])
    todo = ('<div class="wc"><div class="wct">My to-do list<span>2</span></div>'
            '<div class="st"><span class="sto"></span>Call TRA office about the reference</div>'
            '<div class="st"><span class="stx">%s</span><span style="color:#8E9197;text-decoration:line-through">Send bank statements to Jitesh</span></div>'
            '<div class="sin" style="margin-top:8px;height:36px;font-size:13px">%sAdd a to-do — Enter adds it · 🔔 set a time</div></div>') % (ic('check', 11, 3), ic('plus', 13))
    dk = ('<div style="display:grid;grid-template-rows:minmax(250px,0.8fr) minmax(0,1fr);gap:16px;flex:1;min-height:0">'
          '<div class="gr3" style="min-height:0">%s%s</div><div class="gr3" style="min-height:0">%s%s%s</div></div>') % (hero, checkin, diary, late, todo)
    ph = ('<div class="pg"><div class="dk contour"><div style="font-size:12px;color:#F2F2F0">Good morning, Hriday · Sat 26 Sept</div>'
          '<div class="dp" style="margin-top:8px;max-width:100%%;overflow:hidden">%sLive: Task Creation Advice</div>'
          '<div style="font-size:24px;letter-spacing:-0.02em;line-height:1.1;margin:10px 0 12px">Your 7 open tasks, at a glance</div>'
          '<div style="display:flex;gap:22px;margin-bottom:12px">%s</div>%s</div>'
          '<div class="wc"><div class="wct">Today<span>not checked in</span></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">%s</div></div>'
          '<div class="wc"><div class="wct">Needs you<span>3</span></div>%s</div></div>') % (
        ic('bell', 12),
        ''.join('<div><div style="font-size:34px;letter-spacing:-0.04em;line-height:1">%s</div><div style="font-size:11px;color:%s;margin-top:4px">%s</div></div>' % x for x in [('1', '#F07BBE', 'late'), ('2', '#F5B94E', 'due soon'), ('2', '#5BE0A5', 'done')]),
        bars([0.9, 0.75, 0.7, 0.45, 0.45, 0.45, 0.45], [LATE, SOON, SOON, '#C9CD3C', '#C9CD3C', '#C9CD3C', '#C9CD3C'], 40, 22, 5),
        ''.join('<span class="ci">%s</span>' % x for x in ['Present', 'Remote', 'Half-day', 'Sick']),
        ''.join(trow(t, False) for t in T[:3]))
    nt = note('Home', 'Staff · 1 of 4', [
        'The owner\'s Home, for one person: the greeting card counts <b>their</b> tasks — late, due soon, done this month — and each bar is one of their tasks.',
        'A live announcement sits in the greeting card with <b>Acknowledge</b> (it was a banner across the top).',
        '<b>Today</b> is the daily check-in (Present · Remote · Half-day · Sick) with the week under it — it was hidden at the foot of Profile and a pop-up.',
        '<b>Due today</b> (their diary), <b>Needs you</b> (late and due soon, worst first) and <b>My to-do list</b> — the same cards directors have.',
        '“How I did in September” opens their month (the KPI that was on Profile).',
        'Footer: the + makes a <b>to-do</b> (staff do not create tasks).'])
    sboard('S_Home.dc.html', 'Staff — Home', [nt, desk(dk, 'Home', 'Desk · 1440 × 900'), sphone(ph, 'Home', 'Phone · first screen')])


# ─────────────────────────────── 2 · Tasks ───────────────────────────────
def tasks():
    head_ = ('<div style="display:flex;align-items:flex-end;justify-content:space-between"><div style="display:flex;align-items:flex-end;gap:14px"><h1 class="h56">Tasks</h1>'
             '<span class="ch">All my companies%s</span><span class="ch">All statuses%s</span></div>'
             '<span style="display:flex;gap:8px"><span class="btnw">%sExport</span></span></div>') % (ic('down', 12), ic('down', 12), ic('down', 13))
    over = ('<div class="dk rings"><div class="ct"><span>Overview</span>%s</div><div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:14px"><div><span class="big">7</span><span class="u">open tasks</span></div>'
            '<span class="dp" style="color:#5BE0A5"><span class="d" style="background:%s"></span>57%% on track</span></div>'
            '<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;margin:16px 0 10px;gap:2px"><span style="flex:1;background:%s"></span><span style="flex:2;background:%s"></span><span style="flex:4;background:#3A3C40"></span></div>'
            '<div style="display:flex;gap:14px;font-size:12px;color:#C9CBCF"><span>● 1 late</span><span>● 2 due soon</span><span>4 no date</span><span>2 done this month</span></div></div>') % (dots(2), OK, LATE, SOON)
    upd = ('<div class="dk"><div class="ct"><span>Updates on my tasks</span><span>1 unread</span></div>'
           '<div style="display:flex;gap:10px;align-items:center;background:#1F2023;border-radius:12px;padding:10px 12px;margin-top:12px">%s<div style="min-width:0;flex:1"><div style="font-size:12px;color:#C9CBCF">Bank and TRA Machine Reconciliation · CC-002</div><div style="font-size:13px">To update by end of today</div></div><span style="font-size:11px;color:#C9CBCF">4d</span></div>'
           '<div style="display:flex;gap:10px;align-items:center;border-radius:12px;padding:10px 12px">%s<div style="min-width:0;flex:1"><div style="font-size:12px;color:#C9CBCF">Quotation On Zoho Accounting Software · TG-004</div><div style="font-size:13px">Hriday is testing the trial.</div></div><span style="font-size:11px;color:#C9CBCF">3mo</span></div></div>') % (av('AD', 26, '#1F2023'), av('JS', 26, '#1F2023'))
    tbl = ('<div class="wc" style="padding:0;flex:1;overflow:hidden"><div class="tl tlh"><span>Task</span><span>Status</span><span>Who</span><span>Latest update</span><span>Deadline</span></div>%s</div>') % ''.join(
        '<div class="tl"><div style="min-width:0"><div style="font-weight:500">%s</div><div class="t2"><span class="mo">%s</span> · %s</div></div><span style="display:flex;align-items:center;gap:6px"><span class="d" style="background:#B9BBBF"></span>%s</span>%s<span class="t2" style="margin:0">%s</span><span style="color:%s">%s</span></div>' % (
            t[1], t[2], t[3], t[6], faces(t[4][:3], 22), t[7], TXT[t[0]], t[5]) for t in T[:5])
    bar = ('<div style="position:absolute;left:50%%;transform:translateX(-50%%);bottom:14px;width:760px;height:52px;background:#fff;border:1px solid #E4E4E0;border-radius:16px;box-shadow:0 10px 28px rgba(17,18,20,.12);display:flex;align-items:center;gap:8px;padding:0 8px 0 14px;box-sizing:border-box">%s<span style="flex:1;color:#8E9197;font-size:13px">Search my tasks — a code, a word, a company</span>%s</div>') % (
        ic('search', 15), ''.join('<span class="ch%s" style="height:34px">%s</span>' % (' cho' if i == 0 else '', x) for i, x in enumerate(['All 7', 'Late 1', 'Due soon 2', 'Done 2'])))
    dk = '%s<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">%s%s</div>%s%s' % (head_, over, upd, tbl, bar)
    ph = ('<div class="pg"><div class="hd"><h1 class="h1">Tasks</h1><span class="ibd">%s</span></div>%s%s'
          '<div class="wc" style="padding:4px 14px">%s</div></div><div class="fade"></div>'
          '<div class="sbar"><div class="sin">%sSearch my tasks</div><div class="cr" style="margin:0;padding:0">%s</div></div>') % (
        ic('filter', 16), chips(['All my companies', 'All statuses']), over.replace('class="dk rings"', 'class="dk rings" style="padding:14px 16px"'),
        ''.join(trow(t) for t in T[:5]), ic('search', 16),
        ''.join('<span class="ch%s" style="height:32px">%s</span>' % (' cho' if i == 0 else '', x) for i, x in enumerate(['All 7', 'Late 1', 'Due soon 2', 'Done 2'])))
    nt = note('Tasks', 'Staff · 2 of 4', [
        'Its own page now (it lived inside Home). The same list as the owner\'s — Task · Status · Who · Latest update · Deadline — with <b>only their tasks</b>.',
        '<b>Overview</b>: their 7 open, the on-track bar, late / due soon / no date / done this month.',
        '<b>Updates on my tasks</b> replaces the Activity page: the newest updates, unread first; a tap opens the task.',
        'Filters: their companies and status; search and the Late / Due soon / Done chips float at the foot, as everywhere.',
        '<b>No quick-add row, no bulk edit, no board or calendar views</b> — staff do not create or re-plan tasks. Export stays (their own list).',
        'A row opens the quick side panel (update, status, subtasks) — the same panel as the owner\'s.'])
    sboard('S_Tasks.dc.html', 'Staff — Tasks', [nt, desk(dk, 'Tasks', 'Desk · 1440 × 900'), sphone(ph, 'Tasks', 'Phone')])


# ─────────────────────────────── 3 · A task ───────────────────────────────
def task():
    band = ('<div class="dk" style="padding:18px 22px"><div style="display:flex;align-items:center;gap:10px"><span class="btnd">%sTasks</span><span class="mo" style="color:#C9CBCF">TG-002</span><span style="font-size:13px">Terra Green Ltd</span><span style="flex:1"></span>'
            '<span class="btnd">%sSend for review</span><span class="btng">%sI\'m blocked</span><span class="btng">%s</span></div>'
            '<div style="font-size:34px;letter-spacing:-0.025em;margin:14px 0 12px">TRA Sales And Reconciliation</div>'
            '<div style="display:flex;gap:8px">%s</div></div>') % (
        ic('left', 13), ic('check', 13, 2.6), ic('clock', 13), ic('more', 14),
        ''.join('<span class="dp">%s</span>' % x for x in ['<span class="d" style="background:#B9BBBF"></span>Not Started', '<span style="color:#F07BBE">Due 23 Sept · 2d late</span>', 'Medium priority']))
    details = ('<div class="wc" style="display:flex;flex-direction:column;gap:10px"><div class="wct">Details<span>set by whoever runs it</span></div>'
               '<div class="kv">%s</div></div>') % ''.join('<span>%s</span><span>%s</span>' % kv for kv in [
                   ('Company', 'Terra Green Ltd'), ('Accountable', 'Mr Jitesh Solanki'), ('Also on it', 'You · Mr Amal Somaiya'), ('Status', 'Not Started'),
                   ('Priority', 'Medium'), ('Deadline', '23 Sept 2026'), ('Raised by', 'Mr Shivam Parmar'), ('Proof needed', 'No')])
    convo = ('<div class="wc" style="display:flex;flex-direction:column;gap:12px;flex:1"><div class="tabs"><span class="on">Conversation</span><span>Subtasks <b style="font-weight:500">1/3</b></span><span>History</span></div>'
             '<div class="msg">%s<div><div class="t2" style="margin:0">Administrator · 2 Aug</div>Deadline moved to 23 Sept.</div></div>'
             '<div style="flex:1"></div>'
             '<div style="display:flex;gap:6px">%s</div>'
             '<div class="sin" style="height:44px;background:#fff;border:1px solid #E4E4E0">Write an update… use @ to mention a teammate</div>'
             '<div style="display:flex;align-items:center;gap:8px"><span class="btnw">%s</span><span class="btnw">%s</span><span class="btnw">Status: No change%s</span><span style="flex:1"></span><span class="btnk">%sPost update</span></div>'
             '<div class="t2" style="margin:0">Finished? Choose <b>Under Review</b> (or “Send for review” above) — whoever runs the task confirms it.</div></div>') % (
        av('AD', 28), ''.join('<span class="ch" style="height:28px;font-size:12px">%s</span>' % x for x in ['Still on it', 'Waiting on', 'Done, ready for review', 'Need a decision']),
        ic('clip', 14), ic('mic', 14), ic('down', 12), ic('send', 13))
    rail = ('<div class="wc" style="display:flex;flex-direction:column;gap:12px"><div class="wct">People</div>%s'
            '<div class="lk" style="margin-top:6px">Subtasks</div>'
            '<div class="st"><span class="stx">%s</span><span style="color:#8E9197;text-decoration:line-through">Pull Q3 sales ledger</span></div><div class="st"><span class="sto"></span>Reconcile with TRA filings</div><div class="st"><span class="sto"></span>Attach acknowledgement letter</div></div>') % (
        ''.join('<div style="display:flex;align-items:center;gap:10px">%s<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500">%s</div><div class="t2" style="margin:0">%s</div></div>%s</div>' % (av(i, 30), n, r, '<span class="btnw" style="height:30px">%sMessage</span>' % ic('chat', 13) if m else '') for i, n, r, m in [
            ('JS', 'Mr Jitesh Solanki', 'Accountable', True), ('HS', 'You', 'Also on it', False), ('AS', 'Mr Amal Somaiya', 'Also on it', True)]), ic('check', 11, 3))
    dk = '%s<div style="display:grid;grid-template-columns:300px minmax(0,1fr) 300px;gap:16px;flex:1;min-height:0">%s%s%s</div>' % (band, details, convo, rail)
    ph = ('<div class="pg"><div class="dk" style="padding:14px 16px"><div style="display:flex;align-items:center;gap:8px"><span class="btnd" style="height:36px">%sTasks</span><span class="mo" style="color:#C9CBCF">TG-002</span><span style="flex:1"></span><span class="btng" style="height:36px">%s</span></div>'
          '<div style="font-size:24px;letter-spacing:-0.02em;margin:12px 0 10px">TRA Sales And Reconciliation</div><div style="display:flex;gap:6px;flex-wrap:wrap">%s</div>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px"><span class="btnd" style="height:40px;justify-content:center">Send for review</span><span class="btng" style="height:40px;justify-content:center">I\'m blocked</span></div></div>'
          '<div class="wc"><div class="tabs"><span class="on">Conversation</span><span>Subtasks 1/3</span><span>Details</span></div>'
          '<div class="msg" style="margin-top:12px">%s<div><div class="t2" style="margin:0">Administrator · 2 Aug</div>Deadline moved to 23 Sept.</div></div></div>'
          '<div class="wc"><div class="sin" style="height:44px;background:#fff;border:1px solid #E4E4E0">Write an update…</div><div style="display:flex;gap:8px;margin-top:10px"><span class="btnw">%s</span><span class="btnw">%s</span><span style="flex:1"></span><span class="btnk">Post</span></div></div></div>') % (
        ic('left', 13), ic('more', 14), ''.join('<span class="dp">%s</span>' % x for x in ['Not Started', '<span style="color:#F07BBE">2d late</span>', 'Medium']), av('AD', 26), ic('clip', 14), ic('mic', 14))
    nt = note('A task', 'Staff · 3 of 4', [
        'The owner\'s task page, three columns: <b>Details</b> (read-only — whoever runs the task changes them), the <b>conversation</b>, and <b>People</b> + <b>Subtasks</b>.',
        'The dark band\'s buttons are the ones staff have: <b>Send for review</b> (moves it to Under Review with a note) and <b>I\'m blocked</b> (who / why). <b>Complete</b> appears only on a task they raised — with the note, and a file when proof is needed.',
        'Status on an update: In Progress · Under Review · Blocked only.',
        '<b>Subtasks</b>: they tick, add and rename on their own tasks.',
        '<b>Message</b> beside each person (was “Message a teammate”).',
        'The duplicate “Add update” button is gone — the box is the button.'])
    sboard('S_Task.dc.html', 'Staff — a task', [nt, desk(dk, 'Tasks', 'Desk · 1440 × 900'), sphone(ph, 'Tasks', 'Phone')])


# ─────────────────────────────── 4 · Profile ───────────────────────────────
def profile():
    band = ('<div class="dk" style="padding:18px 22px"><div style="display:flex;align-items:center;gap:14px">%s<div style="flex:1;min-width:0"><div style="font-size:30px;letter-spacing:-0.025em">Mr Hriday Solanki</div>'
            '<div style="font-size:13px;color:#F2F2F0;margin-top:4px">Senior Accountant · Oracle Consultancy Ltd</div></div>'
            '<span class="dp">OC-E02</span><span class="dp"><span class="d" style="background:%s"></span>Staff access</span></div>'
            '<div style="display:flex;gap:20px;margin-top:14px;font-size:13px;color:#C9CBCF">%s</div></div>') % (
        av('HS', 52, '#141517'), OK, ''.join('<span style="%s">%s</span>' % ('color:#fff;border-bottom:2px solid #fff;padding-bottom:6px' if i == 0 else 'padding-bottom:6px', x) for i, x in enumerate(['Overview', 'My details', 'My files', 'Attendance', 'Equipment', 'Sign-in & app'])))
    kpi = ('<div class="dk rings" style="display:flex;gap:18px;align-items:center"><div style="flex:1"><div class="ct"><span>How I did · September 2026</span><span>‹ ›</span></div>'
           '<div style="display:flex;gap:24px;margin-top:14px"><div><div style="font-size:44px;letter-spacing:-0.04em;line-height:1;color:#5BE0A5">2</div><div style="font-size:12px;margin-top:4px">completed</div></div>'
           '<div><div style="font-size:44px;letter-spacing:-0.04em;line-height:1">7</div><div style="font-size:12px;margin-top:4px">open now</div></div>'
           '<div><div style="font-size:44px;letter-spacing:-0.04em;line-height:1;color:#F07BBE">1</div><div style="font-size:12px;margin-top:4px">late</div></div></div></div></div>')
    att = ('<div class="wc" style="display:flex;flex-direction:column;gap:10px"><div class="wct">Attendance<span>this week</span></div><div class="wk">%s</div><div class="t2" style="margin:0;white-space:normal">Check in on Home each day. Your manager can adjust a day if needed.</div></div>') % (
        ''.join('<span class="wkd">%s<b>%s</b></span>' % (d, v) for d, v in [('Mon', 'In'), ('Tue', 'In'), ('Wed', 'Remote'), ('Thu', 'In'), ('Fri', 'In'), ('Sat', '·')]))
    det = ('<div class="wc" style="display:flex;flex-direction:column;gap:10px"><div class="wct">My details<span>from HR — ask to change</span></div><div class="kv">%s</div>'
           '<div class="lk" style="margin-top:6px">Contact — you can edit these</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">%s</div></div>') % (
        ''.join('<span>%s</span><span>%s</span>' % kv for kv in [('Staff ID', 'OC-E02'), ('Role', 'Senior Accountant'), ('Email', 'accounts1@oracle.co.tz'), ('Company', 'Oracle Consultancy Ltd')]),
        ''.join('<div class="sin" style="height:36px;background:#fff;border:1px solid #E4E4E0;font-size:12px">%s</div>' % x for x in ['+255 719 982 002', 'WhatsApp: same', 'Where you live', 'Emergency contact']))
    side = ('<div style="display:flex;flex-direction:column;gap:16px"><div class="wc"><div class="wct">My files<span>0</span></div><div class="t2">Nothing on file yet.</div><span class="btnk" style="margin-top:10px;justify-content:center">%sSend a document</span></div>'
            '<div class="wc"><div class="wct">Equipment<span>1</span></div><div style="display:flex;gap:10px;align-items:center;margin-top:8px">%s<div><div style="font-size:13px;font-weight:500">HP Probook</div><div class="t2" style="margin:0">Computer · LPT-017</div></div></div></div>'
            '<div class="wc"><div class="wct">Sign-in &amp; app</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">%s</div></div></div>') % (
        ic('upload', 13), '<span class="ib" style="width:34px;height:34px">%s</span>' % ic('grid', 15),
        ''.join('<div style="display:flex;align-items:center;gap:10px;font-size:13px"><span class="ib" style="width:30px;height:30px">%s</span><span style="flex:1">%s</span><span class="t2" style="margin:0">%s</span></div>' % x for x in [
            (ic('finger', 14), 'Face ID / fingerprint', 'Add'), (ic('key', 14), 'Password', 'Change'), (ic('bell', 14), 'Alerts on this device', 'Off'), (ic('download', 14), 'Install Oracle', 'How')]))
    guides = ('<div class="wc"><div class="wct">Guides &amp; tips</div><div style="display:flex;align-items:center;gap:10px;margin-top:8px;font-size:13px"><span class="ib" style="width:30px;height:30px">%s</span><span style="flex:1">Replay the welcome tour</span><span class="t2" style="margin:0">2 min</span></div></div>') % ic('play', 13)
    dk = '%s<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 320px;gap:16px;align-items:start"><div style="display:flex;flex-direction:column;gap:16px">%s%s%s</div>%s%s</div>' % (band, kpi, att, guides, det, side)
    ph = ('<div class="pg"><div class="dk" style="padding:14px 16px"><div style="display:flex;align-items:center;gap:12px">%s<div style="min-width:0"><div style="font-size:22px;letter-spacing:-0.02em">Mr Hriday Solanki</div><div style="font-size:12px;margin-top:2px">Senior Accountant · OC-E02</div></div></div>'
          '<div style="display:flex;gap:14px;margin-top:12px;font-size:12px;color:#C9CBCF;white-space:nowrap;overflow:hidden"><span style="color:#fff;border-bottom:2px solid #fff;padding-bottom:5px">Overview</span><span>My details</span><span>Files</span><span>Attendance</span><span>Equipment</span></div></div>'
          '%s%s</div>') % (av('HS', 44, '#141517'), kpi.replace('font-size:44px', 'font-size:32px'), att)
    nt = note('Profile', 'Staff · 4 of 4', [
        'The person page in the Studio look, for themselves: dark band with their face, role, staff ID and access; tabs below.',
        '<b>Overview</b>: how they did this month (completed · open · late, month by month) and their attendance week.',
        '<b>My details</b>: HR details read-only (“ask to change”), contact details they edit themselves.',
        '<b>My files</b>: what is on file, <b>Send a document</b>. <b>Equipment</b>: what is signed out to them.',
        '<b>Sign-in &amp; app</b>: Face ID / fingerprint, password, alerts on this device, install Oracle.',
        'Guides &amp; tips and the onboarding journey sit under Overview when they have one.'])
    sboard('S_Profile.dc.html', 'Staff — Profile', [nt, desk(dk, 'Profile', 'Desk · 1440 × 900'), sphone(ph, 'Profile', 'Phone')])


rules(); home(); tasks(); task(); profile()
print(B)
