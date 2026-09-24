from kit import *

# ---------- Hub ----------
left = dark_card(card_title('Portfolio', '<span>14 companies</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 28px">
<div>''' + big('70', 'open') + '''<div style="display: flex; gap: 14px; margin-top: 12px; font-size: 12px; color: #A3A6AB"><span style="color: #F07BBE">16 late</span><span>37 done this month</span></div></div>
<span style="flex-grow: 1"></span>
<div style="display: flex; gap: 18px; align-items: flex-end">
<div style="text-align: center"><div style="font-size: 30px; letter-spacing: -0.03em">3</div><div style="font-size: 11px; color: #5BE0A5">no late work</div></div>
<div style="text-align: center"><div style="font-size: 30px; letter-spacing: -0.03em">5</div><div style="font-size: 11px; color: #F5B94E">some late</div></div>
<div style="text-align: center"><div style="font-size: 30px; letter-spacing: -0.03em">1</div><div style="font-size: 11px; color: #F07BBE">mostly late</div></div>
<div style="text-align: center"><div style="font-size: 30px; letter-spacing: -0.03em">5</div><div style="font-size: 11px; color: #8E9197">nothing open</div></div>
</div></div>''')

risk = [('MES Ltd', 'all 8 open tasks are late', 100), ('PES Ltd', '2 of 11 late', 18), ('Oracle Consultancy Ltd', '2 of 11 late', 18), ('Furaha Innovation Ltd', '2 of 12 late', 17)]
right = dark_card(card_title('Most at risk', '<span>share of open work that is late</span>') + '<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px">' + ''.join(
    '<a href="Company.dc.html" style="display: grid; grid-template-columns: 170px minmax(0, 1fr) 150px; column-gap: 14px; align-items: center; font-size: 13px"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</span><span style="height: 8px; border-radius: 4px; background: #26282C; overflow: hidden"><span style="display: block; width: %d%%; height: 100%%; background: %s"></span></span><span style="font-size: 12px; color: #8E9197; text-align: right">%s</span></a>' % (n, p, '#E0479E' if p > 50 else '#F5A524', s) for n, s, p in risk) + '</div>', texture='rings')

grid = '''<div style="flex-grow: 1; min-height: 0">
<sc-if value="{{isCos}}" hint-placeholder-val="{{ true }}">
<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 12px; height: 100%">
<sc-for list="{{cos}}" as="c" hint-placeholder-count="14"><a href="Company.dc.html" style="background: #FFFFFF; border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; opacity: {{c.op}}">
<span style="display: flex; align-items: center; gap: 10px; min-width: 0"><span style="width: 36px; height: 36px; border-radius: 10px; background: {{c.tile}}; color: {{c.tileFg}}; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: 'Geist Mono', monospace">{{c.px}}</span>
<span style="min-width: 0; flex-grow: 1"><span style="display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{c.name}}</span><span style="display: flex; align-items: center; gap: 5px; font-size: 11px; color: {{c.rc}}"><span style="width: 6px; height: 6px; border-radius: 3px; background: {{c.rd}}"></span>{{c.risk}}</span></span></span>
<span style="flex-grow: 1"></span>
<span style="display: flex; height: 5px; border-radius: 3px; background: #F0F0EC; overflow: hidden"><span style="width: {{c.okW}}; background: #19C37D"></span><span style="width: {{c.lateW}}; background: #E0479E"></span></span>
<span style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); font-size: 11px; color: #8E9197"><span><b style="display: block; font-size: 15px; font-weight: 500; color: #111214">{{c.staff}}</b>staff</span><span><b style="display: block; font-size: 15px; font-weight: 500; color: #111214">{{c.open}}</b>open</span><span><b style="display: block; font-size: 15px; font-weight: 500; color: {{c.lateC}}">{{c.late}}</b>late</span><span><b style="display: block; font-size: 15px; font-weight: 500; color: #111214">{{c.done}}</b>done</span></span>
</a></sc-for>
<button type="button" style="border-radius: 16px; border: 1.5px dashed #CFCFCA; background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #55585E; font-size: 13px">''' + ic('plus', 18, 2) + '''Add a company<span style="font-size: 11px; color: #A3A6AB">name · task-code prefix · colour</span></button>
</div></sc-if>
<sc-if value="{{isRef}}" hint-placeholder-val="{{ false }}">
<div style="display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; height: 100%">
<div style="background: #FFFFFF; border-radius: 20px; padding: 8px; overflow-y: auto">
<sc-for list="{{ref}}" as="r" hint-placeholder-count="8"><div style="display: grid; grid-template-columns: minmax(0, 1fr) 160px auto; column-gap: 14px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #F2F2EE"><span style="font-size: 14px">{{r.name}}</span><span style="font-size: 12px; color: #8E9197">{{r.n}}</span><span style="display: flex; gap: 4px"><span style="height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">Rename</span><span style="height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">Merge into…</span><span style="height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid #F5C6DF; color: #C2327F; font-size: 12px; display: flex; align-items: center">Delete</span></span></div></sc-for>
<sc-if value="{{refEmpty}}" hint-placeholder-val="{{ false }}"><div style="padding: 60px 20px; text-align: center; font-size: 13px; color: #6E7177">{{refEmptyText}}</div></sc-if>
</div>
''' + white_card(wcard_title('{{refAdd}}') + '<div style="display: flex; gap: 8px; margin-top: 10px">' + box('Type a name…', True) + '<span style="height: 38px; padding: 0 14px; border-radius: 10px; background: #111214; color: #FFFFFF; font-size: 13px; display: flex; align-items: center; flex-shrink: 0">Add</span></div><div style="font-size: 12px; color: #6E7177; margin-top: 12px; line-height: 1.5">{{refNote}}</div>', texture='paper-rings') + '''
</div></sc-if>
</div>'''

inner = header('Companies', '', seg_dyn('tabs') + dark_btn('Add company')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 210px; flex-shrink: 0">' + left + right + '</div>' + grid

script = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { tab: 'cos' }; }
  renderVals() {
    var S = this.state, self = this;
    var C = [['ME', 'MES Ltd', 8, 8, 8, 7], ['PE', 'PES Ltd', 13, 11, 2, 3], ['OC', 'Oracle Consultancy Ltd', 5, 11, 2, 5], ['CC', 'Furaha Innovation Ltd', 10, 12, 2, 6], ['TG', 'Terra Green Ltd', 8, 6, 1, 1], ['DS', 'DSC Ltd', 8, 8, 1, 12],
      ['VI', 'V1 Supermarket and Supplies', 10, 11, 0, 2], ['DD', 'Dar Distributors', 3, 2, 0, 0], ['TA', 'Tanam Advisory PVT. Ltd', 6, 1, 0, 1], ['PP', 'Pamoja Plus', 4, 0, 0, 0],
      ['V1', 'Akasaki Middle East LLC', 1, 0, 0, 0], ['RU', 'Rugantino', 1, 0, 0, 0], ['PA', 'Urban Trade Solutions', 1, 0, 0, 0], ['VA', 'Venture Advisory FZCO', 1, 0, 0, 0]];
    var cos = C.map(function (c) {
      var open = c[3], late = c[4], r = open === 0 ? 3 : (late / open > 0.5 ? 2 : (late ? 1 : 0));
      return { px: c[0], name: c[1], staff: c[2], open: open, late: late, done: c[5], lateC: late ? '#C2327F' : '#111214',
        risk: ['On track', 'Watch', 'At risk', 'Nothing open'][r], rc: ['#19A06A', '#B7700A', '#C2327F', '#8E9197'][r], rd: ['#19C37D', '#F5A524', '#E0479E', '#C4C5C9'][r],
        tile: ['#E4F7EE', '#FEF3E0', '#FDEBF4', '#F3F3F1'][r], tileFg: ['#0E7A4F', '#8A5A06', '#A3226A', '#8E9197'][r],
        okW: (open ? (open - late) / 12 * 100 : 0) + '%', lateW: (late / 12 * 100) + '%', op: open === 0 ? '0.75' : '1' };
    });
    var REF = {
      dep: { add: 'Add a department', note: 'Rename or merge moves everyone and every task across. Deleting leaves them with no department. Heads are set per company on the Org tab.', empty: 'Your departments list here with how many people, companies and tasks use each.', rows: [] },
      site: { add: 'Add a site', note: 'Sites are where staff work or live — not company branches. Each shows who works and who lives there.', empty: 'Sites list here with “N work · N living here”.', rows: [] },
      role: { add: 'Add a job title', note: 'Renaming a title updates everyone who holds it. Merge folds two titles into one.', empty: '', rows: [['Director', '5 people'], ['CFO', '1 person'], ['Group Admin Manager', '1 person'], ['Plant Head', '1 person'], ['Business Development Manager', '1 person'], ['TRA and Government Spokesperson', '1 person'], ['Warehouse Manager', '1 person'], ['Accountant', '1 person'], ['Operations', '1 person'], ['Sales Associate', '1 person'], ['Senior Chef', '1 person']] }
    };
    var R = REF[S.tab] || REF.role;
    return {
      cos: cos, isCos: S.tab === 'cos', isRef: S.tab !== 'cos',
      ref: R.rows.map(function (r) { return { name: r[0], n: r[1] }; }), refEmpty: R.rows.length === 0, refEmptyText: R.empty, refAdd: R.add, refNote: R.note,
      tabs: segs([['cos', 'Companies', 14], ['dep', 'Departments'], ['site', 'Sites'], ['role', 'Roles']], S.tab, function (k) { self.setState({ tab: k }); })
    };
  }
}
'''
write('Companies.dc.html', head('Companies') + frame(inner, 'Companies', 'Add company', 'Needs you most', 'MES Ltd · all 8 open tasks are late') + tail(script))

# ---------- One company ----------
def kv(k, v, grey=False):
    return '<div style="display: grid; grid-template-columns: 130px minmax(0, 1fr); column-gap: 10px; padding: 8px 0; border-bottom: 1px solid #F2F2EE; font-size: 13px"><span style="color: #8E9197">%s</span><span style="color: %s">%s</span></div>' % (k, '#A3A6AB' if grey else '#111214', v)

band = '''<div style="background: #141517; border-radius: 20px; padding: 18px 22px; color: #F2F2F0; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0; ''' + tex('contour') + '''">
<div style="display: flex; align-items: center; gap: 8px">
<a href="Companies.dc.html" style="height: 30px; padding: 0 10px; border-radius: 8px; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px">''' + ic('collapse', 13, 2.2) + '''Companies</a>
<span style="flex-grow: 1"></span>
''' + ''.join('<button type="button" style="height: 32px; padding: 0 11px; border-radius: 9px; border: 1px solid #2E3035; background: transparent; color: #E6E6E3; font-size: 12px; display: flex; align-items: center; gap: 6px">%s%s</button>' % (ic(i, 13), l) for i, l in [('list', 'Open in Tasks'), ('folder', 'Files'), ('users', 'Team')]) + '''
<button type="button" style="height: 32px; padding: 0 12px; border-radius: 9px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px">''' + ic('plus', 13, 2.4) + '''New task</button></div>
<div style="display: flex; align-items: flex-end; gap: 18px">
<span style="width: 64px; height: 64px; border-radius: 16px; background: #FEF3E0; color: #8A5A06; font-size: 20px; font-weight: 600; display: flex; align-items: center; justify-content: center; font-family: 'Geist Mono', monospace">CC</span>
<div style="flex-grow: 1"><div style="font-size: 36px; font-weight: 500; letter-spacing: -0.03em; line-height: 1">Furaha Innovation Ltd</div><div style="font-size: 14px; color: #A3A6AB; margin-top: 8px">Task codes CC-… · 12 open · 10 people</div></div>
<div style="display: flex; gap: 6px">''' + pill('Watch · 2 late', '#F5B94E', '#3A2E14', '#F5A524') + '''</div></div>
<div style="display: flex; gap: 2px">''' + ''.join('<span style="height: 32px; padding: 0 12px; border-radius: 9px; font-size: 13px; display: flex; align-items: center; gap: 6px; %s">%s<span style="color: #8E9197; font-size: 12px">%s</span></span>' % ('background: #F2F2F0; color: #111214' if i == 0 else 'color: #C9CBCF', l, n) for i, (l, n) in enumerate([('Overview', ''), ('Profile', ''), ('Tasks', '12'), ('Notes', ''), ('Timeline', ''), ('Org', '')])) + '''</div>
</div>'''

tiles = '<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px">' + ''.join('<a href="#" style="border-radius: 14px; background: #FFFFFF; padding: 14px"><div style="font-size: 28px; letter-spacing: -0.03em; color: %s">%s</div><div style="font-size: 12px; color: #6E7177">%s</div></a>' % t for t in [('#111214', '12', 'open tasks'), ('#C2327F', '2', 'overdue'), ('#111214', '10', 'people'), ('#111214', '15', 'documents'), ('#C2327F', '2', 'documents expired')]) + '</div>'

kchips = ''.join('<span style="height: 26px; padding: 0 9px; border-radius: 7px; background: %s; color: %s; font-size: 12px; display: flex; align-items: center; gap: 5px">%s <b style="font-weight: 600">%s</b></span>' % (bg, fg, l, n) for l, n, bg, fg in [('Overdue', '2', '#FDEBF4', '#A3226A'), ('Due soon', '1', '#FEF3E0', '#8A5A06'), ('Stalled', '0', '#F3F3F1', '#55585E'), ('No deadline', '—', '#F3F3F1', '#55585E'), ('No owner', '0', '#F3F3F1', '#55585E')])
tasks = white_card(wcard_title('Open tasks', '<a href="Main.dc.html" style="color: #111214">All 12 →</a>') + '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px">' + kchips + '</div><div style="display: flex; flex-direction: column; margin-top: 8px">' + ''.join('<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; padding: 8px 0; border-bottom: 1px solid #F2F2EE; font-size: 13px"><span><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">%s</span> %s</span><span style="color: %s; font-size: 12px">%s</span></div>' % t for t in [('CC-026', 'Cocofix Payment', '#C2327F', '2d late'), ('CC-022', 'Plan Of Action', '#C2327F', '1d late'), ('CC-002', 'Bank and TRA Machine Reconciliation', '#B7700A', 'Sat 26'), ('CC-029', 'Stamp Duty - CZ', '#A3A6AB', 'no date'), ('CC-028', 'MIS Reports - Weekly', '#A3A6AB', 'no date')]) + '</div>', 'flex-grow: 1')

brief = dark_card('<div style="display: flex; justify-content: space-between; align-items: center"><div style="font-size: 13px; color: #A3A6AB">ORI briefing</div>' + '<button type="button" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px">' + ic('spark', 13) + 'Generate</button></div><div style="font-size: 15px; line-height: 1.5; margin-top: 12px; color: #E6E6E3">A short written read of how this company is doing — what moved, what is stuck and who to chase — from its tasks, documents and people.</div><div style="font-size: 12px; color: #8E9197; margin-top: 10px">Momentum over 30 days sits beside it once the nightly snapshots have run.</div>', 'flex-grow: 1', 'dots')

people = white_card(wcard_title('People', '<a href="People.dc.html" style="color: #111214">All 10 →</a>') + '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px">' + ''.join('<div style="display: flex; align-items: center; gap: 10px">%s<span style="flex-grow: 1; font-size: 13px">%s<span style="display: block; font-size: 11px; color: #8E9197">%s</span></span></div>' % (avatar(i, 30), n, r) for i, n, r in [('PR', 'Mrs Parin Manek', 'Director · CC-D01'), ('DK', 'Chef Dukhishyam Khuntia', 'Senior Chef · CC-E04')]) + '<div style="font-size: 12px; color: #8E9197">+ 8 who also work for Furaha</div></div>')
docs = white_card(wcard_title('Documents', '<a href="Documents.dc.html" style="color: #111214">All 15 →</a>') + '<div style="display: flex; align-items: center; gap: 16px; margin-top: 10px">' + ring(87, 84, 9, '#19C37D', '#F0F0EC', '13', 'valid', '#111214') + '<div style="font-size: 13px; color: #55585E; line-height: 1.5"><span style="color: #C2327F">2 expired</span> — renew them from here, or open a renewal task in one click.</div></div>')
gov = white_card(wcard_title('Governance', '<span>Profile tab</span>') + '<div style="margin-top: 6px">' + kv('Cap table', 'Add holders and shares', True) + kv('Signatories', 'Add who can sign', True) + kv('Resolutions', 'Log board resolutions', True) + kv('Tracked facts', 'Registration, TIN, VRN…', True) + '</div>', 'flex-grow: 1', 'paper-rings')
equip = white_card(wcard_title('Equipment & suppliers') + '<div style="font-size: 13px; color: #55585E; margin-top: 6px; line-height: 1.5">Assets owned by Furaha and the vendors who serve it, with expired contracts flagged.</div>')

body = '''<div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; gap: 16px">''' + tiles + '''
<div style="flex-grow: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr); gap: 16px">
<div style="display: flex; flex-direction: column; gap: 16px; min-height: 0">''' + tasks + equip + '''</div>
<div style="display: flex; flex-direction: column; gap: 16px; min-height: 0">''' + brief + people + '''</div>
<div style="display: flex; flex-direction: column; gap: 16px; min-height: 0">''' + docs + gov + '''</div>
</div></div>'''
write('Company.dc.html', head('Companies — one company') + frame(band + body, 'Companies', 'New task', 'Company', 'Furaha Innovation Ltd · CC', pad='16px', gap=16) + tail('class Component extends DCLogic { renderVals() { return {}; } }'))
