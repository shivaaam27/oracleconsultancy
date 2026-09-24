from kit import *

# =====================================================================
#  Create & edit — the pattern every record follows (owner, 24 Sept 2026:
#  "design the add task, but also universal add person, company and more,
#   and how editing works").
#  Three boards:
#   QuickAdd.dc.html  — "+ New" opens ONE card, a tab per record type
#   NewTask.dc.html   — "Open as a full task": the record page, as a draft
#   CreateEdit.dc.html— the rules, and which phase each record gets them in
# =====================================================================

# ---------- a quiet stand-in for the Tasks page behind the sheet ----------
def ghost_row(title, code, co, st, dot, due, dueC):
    return ('<div style="display: grid; grid-template-columns: minmax(0,1.5fr) 128px 84px minmax(0,1.6fr) 96px; column-gap: 20px; align-items: center; background: #FFFFFF; border-radius: 14px; padding: 14px 20px">'
            '<span><span style="display: block; font-size: 15px; font-weight: 500">%s</span><span style="font-size: 12px; color: #8E9197"><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #6E7177">%s</span> &nbsp;%s</span></span>'
            '<span style="display: flex; align-items: center; gap: 7px; font-size: 13px"><span style="width: 8px; height: 8px; border-radius: 4px; background: %s"></span>%s</span>'
            '<span>%s</span><span style="font-size: 13px; color: #55585E">—</span><span style="font-size: 13px; color: %s">%s</span></div>') % (title, code, co, dot, st, avatar('SP'), dueC, due)

behind = header('Tasks', chip('All companies') + chip('Everyone'), seg_static(['List', 'Cards', 'Board'], 0) + dark_btn('Filters', 'filter')) + \
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; height: 200px; flex-shrink: 0">' + dark_card(card_title('Overview') + '<div style="flex-grow: 1; display: flex; align-items: flex-end">' + big('70', 'open tasks') + '</div>') + dark_card(card_title('Updates'), texture='rings') + '</div>' + \
    '<div style="display: flex; flex-direction: column; gap: 8px">' + ghost_row('Cocofix Payment', 'CC-026', 'Furaha Innovation Ltd', 'In Progress', BLUE, '2d late', '#C2327F') + ghost_row('Plan Of Action', 'CC-022', 'Furaha Innovation Ltd', 'In Progress', BLUE, '1d late', '#C2327F') + ghost_row('ERP meeting', 'PE-026', 'PES Ltd', 'In Progress', BLUE, '2d late', '#C2327F') + '</div>'

# ---------- the quick-add card ----------
# The quick card is DARK and dotted, like the Go-to panel (owner, 24 Sept 2026:
# the white version "feels not part of the newer design system").
def qchip(label, icon=None, value=None, strong=False):
    v = '<span style="color: #F2F2F0; font-weight: 500">%s</span>' % value if value else ''
    i = '<span style="color: #8E9197; display: flex">%s</span>' % ic(icon, 13) if icon else ''
    bd = '#8E9197' if strong else '#2E3035'
    return '<span style="height: 32px; padding: 0 11px; border-radius: 10px; border: 1px solid %s; background: #1F2023; display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: #8E9197; white-space: nowrap">%s%s%s</span>' % (bd, i, label, (' ' + v) if v else '')

def line(ph, size=20, value=''):
    col = '#F2F2F0' if value else '#5B5E63'
    return '<div style="font-size: %dpx; letter-spacing: -0.015em; color: %s; padding: 4px 0">%s</div>' % (size, col, value or ph)

def qfield(label, v, grey=False, hint=''):
    return field(label, box(v, grey), hint).replace('background: #FFFFFF', 'background: #1F2023').replace('border: 1px solid #E4E4E0', 'border: 1px solid #2E3035').replace('color: #111214', 'color: #F2F2F0').replace('color: #6E7177', 'color: #8E9197')

PANES = {
 'task': line('What needs doing?', 22, 'Chase the TRA refund for September') +
   '<div style="display: flex; flex-wrap: wrap; gap: 6px">' + qchip('Company', 'building', 'DSC Ltd', True) + qchip('Who', 'user', 'Vishal Pragji') + qchip('When', 'cal', 'Fri 2 Oct') + qchip('Priority', 'arrowup', 'High') + qchip('Repeat', 'repeat', 'No') + '</div>' +
   '<div style="border-radius: 12px; background: #1F2023; border: 1px solid #2E3035; padding: 10px 12px; font-size: 13px; color: #6E7177; min-height: 54px">Add instructions for the team — they arrive as the first update (optional)</div>',
 'note': line('Title (optional)', 20) + '<div style="border-radius: 12px; background: #1F2023; border: 1px solid #2E3035; padding: 10px 12px; font-size: 13px; color: #6E7177; min-height: 96px">Start writing — # tags, @ people, tasks and companies, [[ another note</div>' +
   '<div style="display: flex; gap: 6px">' + qchip('Folder', 'folder', 'Meetings') + qchip('Template', 'doc', 'None') + '</div>',
 'event': line('What is it?', 22, 'Board meeting — DSC Q3') +
   '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px">' + qfield('Starts', 'Thu 1 Oct · 10:00') + qfield('Ends', '11:30') + qfield('Where', 'Office, Dar es Salaam') + '</div>' +
   '<div style="display: flex; flex-wrap: wrap; gap: 6px">' + qchip('Guests', 'users', 'Pulin, Jitesh +2') + qchip('Company', 'building', 'DSC Ltd') + qchip('Remind', 'bell', '1 day before') + '</div>' +
   '<div style="display: flex; align-items: center; gap: 10px; font-size: 13px">' + toggle(True) + 'Email the invitation to the guests</div>',
 'person': '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">' + qfield('Full name', 'Amina Salim') + qfield('Company', 'Terra Green Ltd') + qfield('Role', 'Accountant') + qfield('Reports to', 'Jitesh Solanki') + qfield('Phone', '+255 7…', True) + qfield('Email', 'name@…', True) + '</div>' +
   '<div style="display: flex; align-items: center; gap: 10px; font-size: 13px">' + toggle(False) + 'Give them a portal login now <span style="color: #8E9197">— can be done later from their record</span></div>',
 'document': '<div style="border: 1.5px dashed #3A3D42; border-radius: 14px; height: 92px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #A3A6AB; font-size: 13px">' + ic('upload', 16) + 'Drop a file, or click to choose — it is read and the fields below fill in</div>' +
   '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px">' + qfield('Belongs to', 'PES Ltd') + qfield('Category', 'Licence') + qfield('Expires', '31 Dec 2026') + '</div>',
 'company': '<div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px">' + qfield('Name', 'Zanzi Foods Ltd') + qfield('Task code prefix', 'ZF', False, 'two letters') + '</div>' +
   '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">' + qfield('TIN', 'optional', True) + qfield('Registration no.', 'optional', True) + '</div>',
 'announce': line('Headline', 22, 'Office closed on Monday') + '<div style="border-radius: 12px; background: #1F2023; border: 1px solid #2E3035; padding: 10px 12px; font-size: 13px; color: #6E7177; min-height: 64px">The message staff will see on the portal</div>' +
   '<div style="display: flex; flex-wrap: wrap; gap: 6px">' + qchip('Who sees it', 'users', 'Everyone') + qchip('Publish', 'clock', 'Now') + qchip('Ask them to confirm', 'check', 'Yes') + '</div>',
}
ACTION = {'task': 'Create task', 'note': 'Create note', 'event': 'Create event', 'person': 'Add person', 'document': 'File document', 'company': 'Add company', 'announce': 'Publish'}
FULL = {'task': 'Open as a full task', 'note': 'Open the full note', 'event': 'Open the full event', 'person': 'Open the full record', 'document': 'Add several at once', 'company': 'Open the full record', 'announce': 'Open the full announcement'}

panes = ''.join('<sc-if value="{{is_%s}}" hint-placeholder-val="{{ %s }}"><div style="display: flex; flex-direction: column; gap: 14px; animation: pop 180ms ease-out">%s</div></sc-if>' % (k, 'true' if k == 'task' else 'false', v) for k, v in PANES.items())

sheet = '''<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(14,15,16,0.35); z-index: 5"></div>
<div style="position: absolute; right: 24px; bottom: 16px; width: 720px; background-color: #141517; ''' + tex('dots') + '''; color: #F2F2F0; border-radius: 24px; box-shadow: 0 30px 80px rgba(0,0,0,0.40); z-index: 6; padding: 20px; display: flex; flex-direction: column; gap: 16px; animation: pop 220ms ease-out">
<div style="display: flex; align-items: center; gap: 6px"><sc-for list="{{tabs}}" as="s" hint-placeholder-count="7"><button type="button" onClick="{{s.pick}}" aria-pressed="{{s.on}}" style="height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid {{s.bd}}; background: {{s.bg2}}; color: {{s.fg2}}; font-size: 12px; white-space: nowrap">{{s.label}}</button></sc-for><span style="flex-grow: 1"></span>
<button type="button" aria-label="Close" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid #2E3035; background: transparent; color: #C9CBCF; display: flex; align-items: center; justify-content: center">''' + ic('x', 13, 2.2) + '''</button></div>
''' + panes + '''
<div style="text-align: right; font-size: 11px; color: #6E7177; margin-top: -8px">Enter creates · Ctrl+Enter creates and starts another · Shift+Enter opens the full one</div>
<div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px; border-top: 1px solid #26282C; padding-top: 12px">
<a href="NewTask.dc.html" style="font-size: 13px; color: #A3A6AB; display: flex; align-items: center; gap: 6px">{{full}}''' + ic('expand', 12, 2.2) + '''</a>
<button type="button" style="height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid #34363B; background: transparent; color: #E6E6E3; font-size: 13px">Create and add another</button>
<button type="button" style="height: 36px; padding: 0 16px; border-radius: 10px; border: 0; background: #F2F2F0; color: #111214; font-size: 13px; font-weight: 600">{{action}}</button>
</div>
</div>'''

script_q = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { t: 'task' }; }
  renderVals() {
    var self = this, t = this.state.t;
    var A = ''' + json.dumps(ACTION) + ''', F = ''' + json.dumps(FULL) + ''';
    var out = { action: A[t], full: F[t],
      tabs: segs([['task', 'Task'], ['note', 'Note'], ['event', 'Event'], ['person', 'Person'], ['document', 'Document'], ['company', 'Company'], ['announce', 'Announcement']], t, function (k) { self.setState({ t: k }); }).map(function (x) { x.bg2 = x.on ? '#F2F2F0' : 'transparent'; x.fg2 = x.on ? '#111214' : '#A3A6AB'; x.bd = x.on ? '#F2F2F0' : '#2E3035'; return x; }) };
    ['task', 'note', 'event', 'person', 'document', 'company', 'announce'].forEach(function (k) { out['is_' + k] = k === t; });
    return out;
  }
}
'''
write('QuickAdd.dc.html', head('Quick add — one card for every record') + frame(behind + sheet, 'Tasks', 'New task', 'Next deadline', 'Sat 26 Sept · Bank and TRA Machine Reconciliation') + tail(script_q))

# ---------- the full new task: the record page, as a draft ----------
def drow(label, value, grey=True, need=False, hint=''):
    n = '<span style="color: #E0479E; margin-left: 3px">*</span>' if need else ''
    h = '<span style="display: block; font-size: 11px; color: #8E9197">%s</span>' % hint if hint else ''
    return '<div style="display: grid; grid-template-columns: 104px minmax(0,1fr); gap: 12px; align-items: center; border-bottom: 1px solid #F0F0EC; padding: 10px 0"><span style="font-size: 13px; color: #8E9197">%s%s</span><span style="font-size: 13px; color: %s">%s%s</span></div>' % (label, n, '#8E9197' if grey else '#111214', value, h)

band = '''<div style="background-color: #141517; ''' + tex('rings') + '''; border-radius: 20px; padding: 16px 20px; color: #F2F2F0; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0">
<div style="display: flex; align-items: center; gap: 8px">
<a href="Main.dc.html" style="height: 32px; padding: 0 12px; border-radius: 9px; background: #F2F2F0; color: #111214; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500">''' + ic('left', 12, 2.2) + '''Back to the list</a>
<span style="font-family: 'Geist Mono', monospace; font-size: 11px; padding: 4px 8px; border-radius: 6px; background: #26282C; color: #C9CBCF">NEW</span>
<span style="font-size: 13px; color: #A3A6AB">Not saved yet — the code is given when you create it</span>
<span style="flex-grow: 1"></span>
<button type="button" style="height: 32px; padding: 0 12px; border-radius: 9px; border: 1px solid #34363B; background: transparent; color: #F2F2F0; font-size: 12px">Discard</button>
<button type="button" style="height: 32px; padding: 0 12px; border-radius: 9px; border: 1px solid #34363B; background: transparent; color: #F2F2F0; font-size: 12px">Create and add another</button>
<button type="button" style="height: 32px; padding: 0 14px; border-radius: 9px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px">''' + ic('check', 12, 2.4) + '''Create task</button>
</div>
<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 24px">
<div style="font-size: 36px; font-weight: 500; letter-spacing: -0.03em; color: #F2F2F0; border-bottom: 1.5px solid #3A3D42; padding-bottom: 4px; flex-grow: 1">Chase the TRA refund for September<span style="display: inline-block; width: 2px; height: 34px; background: #F2F2F0; vertical-align: -6px; margin-left: 2px; animation: breathe 1s infinite"></span></div>
<div style="display: flex; gap: 6px; flex-shrink: 0">''' + ''.join('<span style="height: 28px; padding: 0 10px; border-radius: 8px; background: #1F2023; font-size: 12px; display: flex; align-items: center; gap: 6px; color: %s">%s</span>' % (c, l) for l, c in [('<span style="width: 7px; height: 7px; border-radius: 4px; background: #B9BBBF"></span>Not started', '#F2F2F0'), ('Fri 2 Oct', '#F2F2F0'), ('High priority', '#F2F2F0'), ('Doesn’t repeat', '#F2F2F0')]) + '''</div>
</div>
</div>'''

details = white_card(wcard_title('Details', 'Click any value to set it') +
    drow('Company', 'DSC Ltd', False, True, 'Sets the code: DS-0…') + drow('Accountable', 'Vishal Pragji', False) + drow('Status', 'Not started', False) +
    drow('Priority', 'High', False) + drow('Deadline', 'Fri 2 Oct 2026', False) + drow('Meeting date', 'Not set') + drow('Risk', 'Not set') +
    drow('Department', 'Not set') + drow('Category', 'Finance', False) +
    '<div style="font-size: 15px; font-weight: 600; margin: 16px 0 6px">Rules</div>' +
    '<div style="display: flex; align-items: center; gap: 12px; padding: 6px 0"><span style="flex-grow: 1; font-size: 13px">First person is the lead<span style="display: block; font-size: 11px; color: #8E9197">Only the lead has to finish it</span></span>' + toggle(False) + '</div>' +
    '<div style="display: flex; align-items: center; gap: 12px; padding: 6px 0"><span style="flex-grow: 1; font-size: 13px">Needs a file to complete<span style="display: block; font-size: 11px; color: #8E9197">Staff can’t close it without proof</span></span>' + toggle(True) + '</div>',
    'overflow: hidden')

centre = white_card(
    '<div style="display: flex; gap: 20px; border-bottom: 1px solid #F0F0EC; font-size: 13px; margin-top: -4px"><span style="border-bottom: 2px solid #111214; padding: 10px 0">Instructions</span><span style="color: #8E9197; padding: 10px 0">Attachments</span></div>' +
    '<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 12px; padding-top: 14px">' +
    '<div style="font-size: 12px; color: #8E9197">What the team should know. It becomes the first update on the task — pinned as the current instruction if you like.</div>' +
    '<div style="flex-grow: 1; border-radius: 14px; background: #F3F3F1; padding: 14px 16px; font-size: 14px; line-height: 1.55; color: #111214">Refund for September was filed on 3 Sept. Call the TRA office, get the reference and the expected date, and attach the acknowledgement letter.<br><br><span style="color: #8E9197">@Vishal Pragji please update here by Wednesday.</span></div>' +
    '<div style="display: flex; align-items: center; gap: 8px"><span style="width: 32px; height: 32px; border-radius: 9px; border: 1px solid #E4E4E0; display: flex; align-items: center; justify-content: center">' + ic('clip', 14) + '</span><span style="width: 32px; height: 32px; border-radius: 9px; border: 1px solid #E4E4E0; display: flex; align-items: center; justify-content: center">' + ic('mic', 14) + '</span>' +
    '<span style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #55585E; margin-left: 6px">' + toggle(True) + 'Pin as the current instruction</span></div>' +
    '</div>', 'padding-top: 8px')

rail = '<div style="display: flex; flex-direction: column; gap: 14px; min-width: 0">' + \
    white_card(wcard_title('People') + '<div style="display: flex; align-items: center; gap: 10px; margin-top: 10px">' + avatar('VP', 32) + '<span style="font-size: 13px; font-weight: 500">Vishal Pragji<span style="display: block; font-size: 11px; color: #8E9197; font-weight: 400">Accountable · 13 open, none late</span></span></div>' +
               '<div style="margin-top: 10px; height: 34px; border-radius: 10px; border: 1px dashed #CFCFCA; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #55585E">Add someone</div>' +
               '<div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: #55585E">' + toggle(True) + 'Tell them now (WhatsApp draft)</div>') + \
    white_card(wcard_title('Also create in') + '<div style="font-size: 12px; color: #8E9197; margin: 4px 0 10px">A separate copy per company, each with its own code</div>' +
               '<div style="display: flex; flex-direction: column; gap: 8px">' + check('PES Ltd') + check('MES Ltd') + check('Terra Green Ltd') + '</div>') + \
    white_card(wcard_title('Repeat') + '<div style="margin-top: 8px; font-size: 13px; color: #8E9197">Doesn’t repeat</div><div style="margin-top: 10px; height: 34px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; align-items: center; justify-content: center; font-size: 12px">Make it repeat…</div>') + '</div>'

inner_full = band + '<div style="flex-grow: 1; min-height: 0; display: grid; grid-template-columns: 340px minmax(0,1fr) 300px; gap: 16px">' + details + centre + rail + '</div>'
write('NewTask.dc.html', head('New task — the record page, as a draft') + frame(inner_full, 'Tasks', 'New task', 'You are in', 'Tasks › New task', pad='20px 20px 20px', gap=16) + tail('class Component extends DCLogic { renderVals() { return {}; } }'))

# ---------- the rules, and when each record gets them ----------
def rule_card(n, title, body):
    return white_card('<div style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">%s</div><div style="font-size: 18px; font-weight: 500; letter-spacing: -0.01em; margin-top: 6px">%s</div><div style="font-size: 13px; color: #55585E; line-height: 1.5; margin-top: 8px">%s</div>' % (n, title, body), 'min-height: 150px')

rules = '<div style="display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; flex-shrink: 0">' + \
    rule_card('01', 'One “+ New”, every record', 'The footer’s + New opens one card with a tab per record type. It already knows the page you are on — on People it opens on Person.') + \
    rule_card('02', 'Quick first, full when needed', 'The card asks only what a record cannot exist without. “Open the full …” turns it into the record page itself, as an unsaved draft.') + \
    rule_card('03', 'Adding and editing are one screen', 'The draft IS the record page: same Details, same controls, same places. Create it and it simply stops being a draft — nothing moves.') + \
    rule_card('04', 'Edit where it is', 'Click a value to change it — a pick-list, a calendar, a people picker, a text box. Undo on every change. The full form only for many fields at once.') + '</div>'

rows = [
  ('Task', 'Quick add line · + New · Shift+Enter', 'What · company · who · when · priority', 'Details · instructions · people · also-create-in · repeat', 'Phase 1 · Tasks', True),
  ('Note', '+ New · Notes shelf', 'Title · first words · folder', 'The note sheet (already one screen)', 'Phase 4 · Work pages', False),
  ('Event', '+ New · Calendar (drag a slot)', 'What · when · guests · send invites', 'Details · papers that travel · guests · alarms', 'Phase 4 · Work pages', False),
  ('Announcement', '+ New · Announcements', 'Headline · message · who sees it', 'Message · audience · confirmations', 'Phase 4 · Work pages', False),
  ('Person', '+ New · People', 'Name · company · role · reports to · phone', 'Profile · HR · portal access · journeys', 'Phase 5 · Records', False),
  ('Company', '+ New · Companies', 'Name · task code prefix', 'Profile · letterhead · governance · people', 'Phase 5 · Records', False),
  ('Document', '+ New · Documents (drop files)', 'File · belongs to · category · expiry', 'Add several · read by AI, you confirm', 'Phase 5 · Records', False),
  ('Asset / Vendor', 'Assets & Vendors page', 'Name · category · who holds it', 'Record · assignments · contracts', 'Phase 5 · Records', False),
  ('Supplies · Cleaning · Attendance', 'On their own page', 'The row itself (inline)', 'Registers — edited in the grid', 'Phase 6 · Operations', False),
]
th = '<div style="display: grid; grid-template-columns: 170px 230px minmax(0,1fr) minmax(0,1fr) 170px; gap: 16px; padding: 0 20px 8px; font-size: 12px; color: #6E7177"><span>Record</span><span>Where you add it</span><span>The quick card asks</span><span>The full record adds</span><span>Built in</span></div>'
tr = ''.join('<div style="display: grid; grid-template-columns: 170px 230px minmax(0,1fr) minmax(0,1fr) 170px; gap: 16px; align-items: center; background: #FFFFFF; border-radius: 14px; padding: 9px 20px; border: 1.5px solid %s"><span style="font-size: 14px; font-weight: 500">%s</span><span style="font-size: 12px; color: #55585E">%s</span><span style="font-size: 13px">%s</span><span style="font-size: 13px; color: #55585E">%s</span><span>%s</span></div>' % ('#111214' if now else '#FFFFFF', r, w, q, f, lpill(ph, OK if now else '#B9BBBF')) for r, w, q, f, ph, now in rows)

inner_rules = header('Create & edit', '', lpill('One pattern, every record', INK)) + rules + '<div style="flex-grow: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 8px">' + th + tr + '</div>'
write('CreateEdit.dc.html', head('Create & edit — the pattern') + frame(inner_rules, 'Tasks', 'New task', 'Plan', 'Each record gets this in its own phase') + tail('class Component extends DCLogic { renderVals() { return {}; } }'))
