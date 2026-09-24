from kit import *

# =====================================================================
#  Ask ORI (the ⌘K surface) and Notifications — redesigned for Studio
#  (owner, 24 Sept 2026: "the ask bar — make a mockup — and notification,
#   it needs a revamp").
#   Ask.dc.html            — one box: search · ask ORI · do. Empty + answered.
#   Notifications.dc.html  — the bell's panel: two lanes, day groups, actions.
# =====================================================================

# ---------- a dimmed stand-in for Home behind the sheets ----------
def ghost_home():
    hero = dark_card(card_title('Good afternoon, Shivam · Thursday 24 September') +
        '<div style="font-size: 30px; font-weight: 500; letter-spacing: -0.02em; margin-top: 6px">Your 70 open tasks, at a glance</div><div style="flex-grow: 1"></div>' +
        '<div style="display: flex; align-items: flex-end; gap: 3px; height: 64px">' + ''.join('<span style="flex: 1; max-width: 9px; height: %dpx; border-radius: 3px; background: %s"></span>' % (26 + (k * 37) % 40, '#CFE05A' if k < 13 else '#19C37D' if k < 51 else '#F5A524' if k < 54 else '#E0479E') for k in range(70)) + '</div>',
        'grid-column: 1 / span 2')
    due = dark_card(card_title('Due this week') + '<div style="flex-grow: 1"></div>' + big('3', 'from Friday to Saturday', 88), texture='rings')
    w = lambda k, t: white_card('<div style="font-size: 12px; color: #8E9197">%s</div><div style="font-size: 22px; font-weight: 500; margin-top: 2px">%s</div>' % (k, t))
    return '<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); grid-template-rows: 280px minmax(0,1fr); gap: 16px">' + hero + due + w('Tasks', 'Late, needs you') + w('People', 'Team load') + w('Companies', 'Company health') + '</div>'

DIM = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(14,15,16,0.38); z-index: 5"></div>'

def dchip(label, on=False):
    st = 'background: #F2F2F0; color: #111214; border-color: #F2F2F0' if on else 'background: transparent; color: #A3A6AB; border-color: #2E3035'
    return '<span style="height: 30px; padding: 0 11px; border-radius: 9px; border: 1px solid; %s; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap">%s</span>' % (st, label)

def codechip(code):
    return '<span style="font-family: \'Geist Mono\', monospace; font-size: 11px; padding: 1px 6px; border-radius: 5px; background: #26282C; color: #E6E6E3">%s</span>' % code

def av(ini, size=28):
    return '<span style="width: %dpx; height: %dpx; border-radius: %dpx; background: %s; color: #111214; font-size: %dpx; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0">%s</span>' % (size, size, size // 2, AVC.get(ini, '#DADAD5'), max(9, size // 3), ini)

# =====================================================================
#  Ask
# =====================================================================
suggest = [
    ('spark', 'What needs me today?', 'Late, due today and waiting on you'),
    ('users', 'Who is overloaded?', 'Open and late work per person'),
    ('building', 'How is MES doing this week?', 'Its tasks, updates and what is late'),
    ('send', 'Remind everyone with late work', 'Drafts one message per person — you send'),
    ('pin', 'Remember that TRA filings go to Vishal', 'ORI keeps it for next time'),
    ('doc', 'Find the PES trading licence', 'Documents, by name, company or date'),
]
empty = '''<sc-if value="{{isEmpty}}" hint-placeholder-val="{{ true }}"><div style="display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 20px; animation: pop 200ms ease-out">
<div><div style="font-size: 12px; color: #6E7177; margin-bottom: 10px">Try asking</div>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px">''' + ''.join(
    '<button type="button" onClick="{{ask}}" style="text-align: left; border: 1px solid #26282C; background: #1A1B1E; border-radius: 14px; padding: 12px 14px; color: #F2F2F0; display: flex; gap: 10px"><span style="width: 28px; height: 28px; border-radius: 8px; background: #26282C; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #C9CBCF">%s</span><span style="min-width: 0"><span style="display: block; font-size: 13px; font-weight: 500">%s</span><span style="display: block; font-size: 11px; color: #8E9197; margin-top: 2px">%s</span></span></button>' % (ic(i, 14), t, s) for i, t, s in suggest) + '''</div></div>
<div><div style="font-size: 12px; color: #6E7177; margin-bottom: 10px">Recent</div>
<div style="display: flex; flex-direction: column; gap: 4px">''' + ''.join(
    '<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; font-size: 13px; color: #C9CBCF"><span style="color: #6E7177; display: flex">%s</span>%s</div>' % (ic(i, 13), t) for i, t in [('history', 'cocofix'), ('history', 'Who has the TRA machine task?'), ('history', 'Jitesh Solanki'), ('history', 'Dar Distributors')]) + '''</div>
<div style="font-size: 12px; color: #6E7177; margin: 18px 0 10px">Jump to</div>
<div style="display: flex; flex-wrap: wrap; gap: 6px">''' + ''.join(dchip(x) for x in ['Tasks', 'Calendar', 'People', 'Documents', 'Director Brief', 'Settings']) + '''</div></div>
</div></sc-if>'''

answer_text = ('MES has <b style="color: #F2F2F0">8 open tasks and all 8 are late</b> — the worst in the group. '
               'The oldest are ' + codechip('ME-013') + ' ROSVIN recon (6d late) and ' + codechip('ME-016') + ' MES first machine payment (4d late). '
               'Pulin Manek holds 5 of them; the last update on any of them was 3 days ago.')
answered = '''<sc-if value="{{isAnswer}}" hint-placeholder-val="{{ false }}"><div style="display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 20px; animation: pop 200ms ease-out">
<div style="border-radius: 18px; background: #1A1B1E; border: 1px solid #26282C; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #A3A6AB"><span style="width: 22px; height: 22px; border-radius: 11px; background: #F2F2F0; color: #111214; display: flex; align-items: center; justify-content: center">''' + ic('spark', 12) + '''</span>ORI · from 8 tasks, 1 company, 14 updates</div>
<div style="font-size: 15px; line-height: 1.6; color: #E6E6E3">''' + answer_text + '''</div>
<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px">''' + ''.join(
    '<button type="button" style="height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid %s; background: %s; color: %s; font-size: 12px; display: flex; align-items: center; gap: 6px">%s%s</button>' % (b, bg, fg, ic(i, 13), t)
    for i, t, b, bg, fg in [('send', 'Remind Pulin about all 5', '#F2F2F0', '#F2F2F0', '#111214'), ('list', 'Show them on Tasks', '#34363B', 'transparent', '#E6E6E3'), ('doc', 'Draft a note to the MES directors', '#34363B', 'transparent', '#E6E6E3')]) + '''</div>
<div style="display: flex; align-items: center; gap: 8px; border-top: 1px solid #26282C; padding-top: 12px"><input placeholder="Ask a follow-up…" style="flex-grow: 1; border: 0; outline: none; background: transparent; font: inherit; font-size: 13px; color: #F2F2F0"><span style="font-size: 11px; color: #6E7177">Enter</span></div>
</div>
<div style="display: flex; flex-direction: column; gap: 14px; min-width: 0">
<div><div style="font-size: 12px; color: #6E7177; margin-bottom: 8px">Tasks · 8</div>''' + ''.join(
    '<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: %s"><span style="width: 7px; height: 7px; border-radius: 4px; background: #E0479E; flex-shrink: 0"></span><span style="min-width: 0; flex-grow: 1"><span style="display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</span><span style="display: block; font-size: 11px; color: #8E9197">%s · %s</span></span><span style="font-size: 11px; color: #F07BBE">%s</span></div>' % ('#26282C' if n == 0 else 'transparent', t, c, w, l)
    for n, (t, c, w, l) in enumerate([('ROSVIN Recon - Payments due and Test', 'ME-013', 'Pulin Manek', '6d late'), ('MES first machine payment', 'ME-007', 'Pulin Manek', '4d late'), ('Ammonia plant visit', 'ME-020', 'Gangadhar M.', '2d late')])) + '''<div style="font-size: 12px; color: #A3A6AB; padding: 6px 10px">+ 5 more on Tasks</div></div>
<div><div style="font-size: 12px; color: #6E7177; margin-bottom: 8px">People · 2</div>
<div style="display: flex; gap: 8px">''' + ''.join('<div style="display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 6px; border-radius: 12px; border: 1px solid #26282C">%s<span style="font-size: 12px">%s</span></div>' % (av(i, 24), n) for i, n in [('PM', 'Pulin Manek'), ('GM', 'Gangadhar M.')]) + '''</div></div>
<div><div style="font-size: 12px; color: #6E7177; margin-bottom: 8px">Pages</div>
<div style="display: flex; flex-wrap: wrap; gap: 6px">''' + dchip('Tasks › MES Ltd · late') + dchip('MES Ltd') + '''</div></div>
</div>
</div></sc-if>'''

ask_sheet = DIM + '''<div style="position: absolute; left: 0; right: 0; bottom: 16px; margin: 0 auto; width: 1080px; background-color: #141517; ''' + tex('dots') + '''; color: #F2F2F0; border-radius: 24px; box-shadow: 0 30px 80px rgba(0,0,0,0.45); z-index: 6; padding: 20px; display: flex; flex-direction: column; gap: 18px; animation: pop 220ms ease-out">
<div style="display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 8px 0 16px; border-radius: 16px; background: #1F2023; border: 1px solid #3A3D42">
<span style="color: #F2F2F0; display: flex">''' + ic('spark', 18) + '''</span>
<span style="flex-grow: 1; font-size: 18px; letter-spacing: -0.01em; color: {{qColor}}">{{q}}</span>
<span style="height: 26px; padding: 0 10px; border-radius: 8px; background: #26282C; color: #C9CBCF; font-size: 11px; display: flex; align-items: center">{{modeWord}}</span>
<button type="button" aria-label="Speak" style="width: 38px; height: 38px; border-radius: 11px; border: 1px solid #2E3035; background: transparent; color: #C9CBCF; display: flex; align-items: center; justify-content: center">''' + ic('mic', 15) + '''</button>
<button type="button" onClick="{{toggle}}" style="height: 38px; padding: 0 14px; border-radius: 11px; border: 0; background: #F2F2F0; color: #111214; font-size: 13px; font-weight: 600">{{btn}}</button>
</div>
''' + empty + answered + '''
<div style="display: flex; justify-content: space-between; font-size: 11px; color: #6E7177"><span>Type to search everything · a question goes to ORI · “remind…”, “create…”, “draft…” do it</span><span>↑↓ move · Enter open · Esc close</span></div>
</div>'''

script_ask = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { a: false }; }
  renderVals() {
    var self = this, a = this.state.a;
    return { isEmpty: !a, isAnswer: a, q: a ? 'How is MES doing, and who has the late ones?' : 'Ask ORI, search, or say what you need…', qColor: a ? '#F2F2F0' : '#6E7177',
      modeWord: a ? 'Asking ORI' : 'Search · Ask · Do', btn: a ? 'New question' : 'Ask',
      toggle: function () { self.setState({ a: !a }); }, ask: function () { self.setState({ a: true }); } };
  }
}
'''
write('Ask.dc.html', head('Ask ORI — search, ask, do') + frame(ghost_home() + ask_sheet, 'Home', 'New task', 'Next deadline', 'Fri 25 Sept · 6 Months Projection Plan', pad='16px', gap=16) + tail(script_ask))

# =====================================================================
#  Notifications
# =====================================================================
def nrow(ini, who, what, code, task, body, when, unread=False, needs=False, open_=False):
    dot = '<span style="width: 7px; height: 7px; border-radius: 4px; background: #2490EF; flex-shrink: 0; margin-top: 7px"></span>' if unread else '<span style="width: 7px; flex-shrink: 0"></span>'
    acts = ''
    if open_:
        acts = '<div style="display: flex; gap: 6px; margin-top: 10px">' + ''.join(
            '<button type="button" style="height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid %s; background: %s; color: %s; font-size: 11px; display: flex; align-items: center; gap: 5px">%s%s</button>' % (b, bg, fg, ic(i, 12), t)
            for i, t, b, bg, fg in [('right', 'Open', '#F2F2F0', '#F2F2F0', '#111214'), ('chat', 'Reply', '#34363B', 'transparent', '#E6E6E3'), ('check', 'Mark read', '#34363B', 'transparent', '#E6E6E3'), ('x', 'Dismiss', '#34363B', 'transparent', '#A3A6AB')]) + '</div>'
    bg = '#1F2023' if open_ else 'transparent'
    tag = '<span style="font-size: 10px; padding: 1px 6px; border-radius: 5px; background: #3A1D2E; color: #F07BBE; margin-left: 6px">needs you</span>' if needs else ''
    return '''<div style="display: flex; gap: 10px; padding: 10px 12px; border-radius: 14px; background: %s">%s%s
<div style="min-width: 0; flex-grow: 1">
<div style="font-size: 13px; line-height: 1.4"><b style="font-weight: 600">%s</b> <span style="color: #A3A6AB">%s</span> %s <span style="color: #F2F2F0">%s</span>%s</div>
<div style="font-size: 12px; color: #A3A6AB; margin-top: 3px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">%s</div>
<div style="font-size: 11px; color: #6E7177; margin-top: 4px">%s</div>%s
</div></div>''' % (bg, dot, av(ini, 30), who, what, codechip(code) if code else '', task, tag, body, when, acts)

needs = ''.join([
    nrow('JM', 'Jilna Manek', 'mentioned you on', 'DD-002', 'Dar Distributors Instagram Plan', '“@Mr Shivam Parmar will send you the logo on email. 20 post pictures are sent.”', '24m ago · reply or mark it read', True, True, True),
    nrow('PM', 'Pulin Manek', 'asked for your decision on', 'PE-026', 'ERP meeting', '“Two quotes in — Odoo or PowerComputers? Need your call before Friday.”', '2h ago', True, True),
    nrow('KA', 'Karim', 'is waiting on you for', 'VI-003', 'Shelving quotations', 'Marked “Waiting on” — the final quotation is 8.22m and needs approval.', 'Yesterday', False, True),
])
activity = ''.join([
    nrow('JS', 'Jitesh Solanki', 'updated', 'CC-026', 'Cocofix Payment', '“In process, awaiting rate from Pulin.”', '1h ago', True),
    nrow('VP', 'Vishal Pragji', 'completed', 'DS-030', 'Payment of coldroom annual maintenance', 'Closed with an attachment: receipt.pdf', '3h ago'),
    nrow('HS', 'Hriday Solanki', 'moved the deadline of', 'CC-002', 'Bank and TRA Machine Reconciliation', 'Deadline → Sat 26 Sept', 'Yesterday'),
])
ori = '''<div style="display: flex; gap: 10px; padding: 10px 12px; border-radius: 14px; border: 1px dashed #34363B">
<span style="width: 7px; flex-shrink: 0"></span><span style="width: 30px; height: 30px; border-radius: 15px; background: #F2F2F0; color: #111214; display: flex; align-items: center; justify-content: center; flex-shrink: 0">''' + ic('spark', 14) + '''</span>
<div style="min-width: 0; flex-grow: 1"><div style="font-size: 13px"><b style="font-weight: 600">ORI’s morning summary</b> <span style="color: #A3A6AB">· 3 notes folded into one</span></div>
<div style="font-size: 12px; color: #A3A6AB; margin-top: 3px">11 staff quiet with open work · 2 decisions still open · 4 documents expire this month</div>
<div style="font-size: 11px; color: #6E7177; margin-top: 4px">09:00 · open to read all three</div></div></div>'''

bell = DIM + '''<div style="position: absolute; right: 16px; bottom: 16px; width: 520px; height: 760px; background-color: #141517; ''' + tex('dots') + '''; color: #F2F2F0; border-radius: 24px; box-shadow: 0 30px 80px rgba(0,0,0,0.45); z-index: 6; padding: 18px 16px 14px; display: flex; flex-direction: column; gap: 12px; animation: pop 220ms ease-out; box-sizing: border-box">
<div style="display: flex; align-items: center; gap: 10px; padding: 0 4px">
<span style="font-size: 20px; font-weight: 500; letter-spacing: -0.01em">Notifications</span>
<span style="height: 22px; padding: 0 8px; border-radius: 7px; background: #3A1D2E; color: #F07BBE; font-size: 11px; display: flex; align-items: center">4 new</span>
<span style="flex-grow: 1"></span>
<button type="button" style="height: 30px; padding: 0 10px; border-radius: 9px; border: 1px solid #2E3035; background: transparent; color: #C9CBCF; font-size: 12px">Mark all read</button>
<button type="button" aria-label="Notification settings" style="width: 30px; height: 30px; border-radius: 9px; border: 1px solid #2E3035; background: transparent; color: #C9CBCF; display: flex; align-items: center; justify-content: center">''' + ic('gear', 13) + '''</button>
</div>
<div style="display: flex; gap: 2px; padding: 3px; background: #1F2023; border-radius: 12px">
<sc-for list="{{lanes}}" as="l" hint-placeholder-count="2"><button type="button" onClick="{{l.pick}}" style="flex: 1; height: 32px; border-radius: 9px; border: 0; background: {{l.bg}}; color: {{l.fg}}; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px">{{l.label}}<span style="font-size: 11px; opacity: 0.7">{{l.n}}</span></button></sc-for>
</div>
<div style="display: flex; gap: 6px; flex-wrap: wrap">''' + dchip('All', True) + dchip('Mentions · 1') + dchip('Updates') + dchip('Reminders') + dchip('ORI') + '''</div>
<div style="flex-grow: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 4px">
<div style="font-size: 11px; color: #6E7177; padding: 4px 12px">Today</div>
<sc-if value="{{isNeeds}}" hint-placeholder-val="{{ true }}"><div style="display: flex; flex-direction: column; gap: 4px; animation: pop 180ms ease-out">''' + needs + '''</div></sc-if>
<sc-if value="{{isAct}}" hint-placeholder-val="{{ false }}"><div style="display: flex; flex-direction: column; gap: 4px; animation: pop 180ms ease-out">''' + ori + activity + '''</div></sc-if>
</div>
<div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #26282C; padding: 10px 4px 0; font-size: 11px; color: #6E7177"><span>Quiet hours 21:00–07:00 · pushes wait until morning</span><span style="color: #C9CBCF">See everything in Activity →</span></div>
</div>'''

script_bell = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { l: 'needs' }; }
  renderVals() {
    var self = this, l = this.state.l;
    var lanes = [['needs', 'Needs you', 3], ['act', 'Activity', 23]].map(function (d) {
      var on = d[0] === l;
      return { label: d[1], n: d[2], bg: on ? '#F2F2F0' : 'transparent', fg: on ? '#111214' : '#A3A6AB', pick: function () { self.setState({ l: d[0] }); } };
    });
    return { lanes: lanes, isNeeds: l === 'needs', isAct: l === 'act' };
  }
}
'''
write('Notifications.dc.html', head('Notifications — needs you, and everything else') + frame(ghost_home(), 'Home', 'New task', 'Next deadline', 'Fri 25 Sept · 6 Months Projection Plan', pad='16px', gap=16).replace('</div>\n<dc-import', bell + '</div>\n<dc-import', 1) + tail(script_bell))
