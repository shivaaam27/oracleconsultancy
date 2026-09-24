from kit import *

# ---------- People list ----------
left = dark_card(card_title('Directory', '<span>48 people · 14 companies</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 28px">
<div>''' + big('34', 'active') + '''<div style="display: flex; gap: 14px; margin-top: 12px; font-size: 12px; color: #A3A6AB"><span>14 inactive</span><span>4 without a portal login</span></div></div>
<span style="flex-grow: 1"></span>''' + ring(88, 116, 12, '#19C37D', '#26282C', '30', 'on the portal') + ring(21, 116, 12, '#E0479E', '#26282C', '7', 'overloaded') + '''
</div>''')

right_idle = '''<sc-if value="{{idle}}" hint-placeholder-val="{{ true }}"><div style="display: flex; flex-direction: column; height: 100%; animation: pop 200ms ease-out">''' + card_title('Needs attention · 15', 'Pick a person to see them here') + '''
<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: end">
<div style="border-radius: 12px; background: #1A1B1E; border: 1px solid #26282C; padding: 12px"><div style="font-size: 26px; letter-spacing: -0.02em">7</div><div style="font-size: 11px; color: #8E9197">carry 5+ open tasks</div></div>
<div style="border-radius: 12px; background: #1A1B1E; border: 1px solid #26282C; padding: 12px"><div style="font-size: 26px; letter-spacing: -0.02em">4</div><div style="font-size: 11px; color: #8E9197">have no contact details</div></div>
<div style="border-radius: 12px; background: #1A1B1E; border: 1px solid #26282C; padding: 12px"><div style="font-size: 26px; letter-spacing: -0.02em">0</div><div style="font-size: 11px; color: #8E9197">probations ending soon</div></div>
</div>
<div style="font-size: 12px; color: #8E9197; margin-top: 10px">Switch to <b style="color: #F2F2F0; font-weight: 500">Attention</b> to work through them worst first — message, fix documents, snooze or skip.</div>
</div></sc-if>'''
right_sel = '''<sc-if value="{{picked}}" hint-placeholder-val="{{ false }}"><div style="display: flex; flex-direction: column; height: 100%; gap: 10px; animation: pop 200ms ease-out">
<div style="display: flex; align-items: center; gap: 8px; height: 26px"><span style="font-family: 'Geist Mono', monospace; font-size: 11px; padding: 3px 7px; border-radius: 6px; background: #26282C; color: #C9CBCF">{{p.id}}</span><span style="font-size: 12px; color: #A3A6AB; flex-grow: 1">{{p.co}}</span>
<a href="Person.dc.html" aria-label="Open the full record" style="width: 28px; height: 28px; border-radius: 8px; background: #F2F2F0; color: #111214; display: flex; align-items: center; justify-content: center">''' + ic('expand', 13, 2.2) + '''</a>
<button type="button" onClick="{{unpick}}" aria-label="Close" style="width: 28px; height: 28px; border-radius: 8px; border: 1px solid #2E3035; background: transparent; color: #C9CBCF; display: flex; align-items: center; justify-content: center">''' + ic('x', 12, 2.4) + '''</button></div>
<div style="display: flex; align-items: center; gap: 12px"><span style="width: 44px; height: 44px; border-radius: 22px; background: {{p.av}}; color: #111214; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center">{{p.ini}}</span><div><div style="font-size: 22px; font-weight: 500; letter-spacing: -0.015em">{{p.name}}</div><div style="font-size: 13px; color: #A3A6AB">{{p.role}}{{p.mgr}}</div></div></div>
<div style="flex-grow: 1"></div>
<div style="display: flex; align-items: center; gap: 8px"><span style="height: 26px; padding: 0 10px; border-radius: 8px; background: #1F2023; font-size: 12px; display: flex; align-items: center">{{p.open}} open</span><span style="height: 26px; padding: 0 10px; border-radius: 8px; background: #1F2023; font-size: 12px; display: flex; align-items: center; color: {{p.lateC}}">{{p.late}} late</span><span style="height: 26px; padding: 0 10px; border-radius: 8px; background: #1F2023; font-size: 12px; display: flex; align-items: center">{{p.portal}}</span><span style="flex-grow: 1"></span>
''' + ''.join('<button type="button" aria-label="%s" style="width: 32px; height: 32px; border-radius: 9px; border: 1px solid #34363B; background: transparent; color: #E6E6E3; display: flex; align-items: center; justify-content: center">%s</button>' % (l, ic(i, 14)) for i, l in [('mail', 'Email'), ('wa', 'WhatsApp'), ('phone', 'Call'), ('chat', 'Chat')]) + '''
<button type="button" style="height: 32px; padding: 0 12px; border-radius: 9px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600">Remind about open work</button></div>
</div></sc-if>'''
right = dark_card(right_idle + right_sel, texture='contour')

people_grid = '''<div style="flex-grow: 1; min-height: 0; position: relative">
<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; padding-bottom: 80px">
<sc-for list="{{groups}}" as="g" hint-placeholder-count="4"><div>
<div style="display: flex; align-items: baseline; gap: 10px; padding: 0 4px 8px"><span style="font-size: 15px; font-weight: 600">{{g.name}}</span><span style="font-size: 12px; color: {{g.c}}">{{g.note}}</span><span style="font-size: 12px; color: #A3A6AB">{{g.n}}</span></div>
<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px">
<sc-for list="{{g.people}}" as="p" hint-placeholder-count="3"><button type="button" onClick="{{p.pick}}" style="text-align: left; border: 1.5px solid {{p.ring}}; background: #FFFFFF; border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0">
<span style="display: flex; align-items: center; gap: 10px; min-width: 0"><span style="width: 38px; height: 38px; border-radius: 19px; background: {{p.av}}; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0">{{p.ini}}</span>
<span style="min-width: 0"><span style="display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{p.short}}</span><span style="display: block; font-size: 12px; color: #8E9197; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{p.role}}</span></span></span>
<span style="display: flex; align-items: center; gap: 6px; font-size: 11px"><span style="font-family: 'Geist Mono', monospace; color: #6E7177; background: #F3F3F1; border-radius: 5px; padding: 2px 6px; white-space: nowrap">{{p.id}}</span><span style="color: #8E9197; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{p.portal}}</span><span style="flex-grow: 1"></span><span style="font-size: 12px; color: {{p.loadC}}; font-weight: 500; white-space: nowrap">{{p.load}}</span></span>
</button></sc-for>
</div></div></sc-for>
</div>
''' + bottom_bar('Search people', '<span style="width: 1px; height: 24px; background: #E4E4E0"></span>' + bar_seg('chips'), 1100) + '''
</div>'''

inner = header('People', chip('All companies') + chip('All types') + chip('All locations'), seg_dyn('modes') + chip('Group', ' · Company') + dark_btn('Add person')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 220px; flex-shrink: 0">' + left + right + '</div>' + people_grid

script = BARSEG_JS + r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { sel: null, mode: 'browse', chip: 'all' }; }
  renderVals() {
    var S = this.state, self = this;
    var G = [
      ['Oracle Consultancy Ltd', '4 overdue', '#C2327F', [['PM', 'Mr Pulin Manek', 'OC-D03', 'Director', 'Director', 12, 8, null], ['JS', 'Mr Jitesh Solanki', 'OC-M01', 'CFO', 'Manager', 25, 6, 'Pulin Manek'], ['SP', 'Mr Shivam Parmar', 'OC-AH07', 'Group Admin Manager', 'Group Admin Manager', 31, 1, 'Pulin Manek']]],
      ['MES Ltd', '4 overdue · 1 no contact', '#C2327F', [['GM', 'Mr Gangadhar Mathankar', 'ME-M04', 'Plant Head', 'Staff', 3, 3, 'Pulin Manek'], ['KS', 'Mr Kishan Suchak', 'ME-D06', 'Director', 'Director', 3, 3, null], ['OM', 'Ops Manager', 'ME-E01', 'Operations', 'Staff', 3, 3, null], ['NV', 'Mr Nayan Vaghela', 'ME-E07', 'Accountant', 'Staff', 2, 2, null], ['CT', 'Mr Chirag Tanna', 'ME-D05', 'Director', 'Director', 0, 0, null]]],
      ['DSC Ltd', '1 overdue', '#B7700A', [['DB', 'Mr Diptobrato Bagchi', 'DS-M04', 'Business Development Manager', 'Staff', 1, 1, 'Jitesh Solanki'], ['VP', 'Mr Vishal Pragji', 'DS-E01', 'TRA and Government Spokesperson', 'Staff', 13, 0, 'Jitesh Solanki'], ['PA', 'Mr Pankaj', 'DS-M05', 'Warehouse Manager', 'Staff', 0, 0, null]]],
      ['Dar Distributors', 'on track', '#19A06A', [['JM', 'Ms Jilna Manek', 'DD-D01', 'Director', 'Director', 6, 0, null], ['GA', 'Gift Abraham', 'DD-E02', 'Sales Associate', 'No portal', 0, 0, null]]],
      ['Furaha Innovation Ltd', 'on track', '#19A06A', [['DK', 'Chef Dukhishyam Khuntia', 'CC-E04', 'Senior Chef', 'Staff', 1, 0, null], ['PR', 'Mrs Parin Manek', 'CC-D01', 'Director', 'Director', 0, 0, null]]]
    ];
    var all = [];
    var groups = G.map(function (g) {
      return { name: g[0], note: g[1], c: g[2], n: g[3].length + ' people', people: g[3].map(function (p) {
        var rec = { ini: p[0], av: av(p[0]), name: p[1], short: p[1].replace(/^(Mr|Ms|Mrs|Chef) /, ''), id: p[2], role: p[3], portal: p[4] === 'No portal' ? 'No portal' : p[4] + ' portal', open: p[5], late: p[6], mgr: p[7] ? ' · reports to ' + p[7] : '', co: g[0],
          load: p[5] ? p[5] + (p[6] ? ' · ' + p[6] + ' late' : ' open') : '—', loadC: p[6] >= 3 ? '#C2327F' : (p[6] ? '#B7700A' : '#55585E'), lateC: p[6] ? '#F07BBE' : '#A3A6AB',
          ring: S.sel === p[2] ? '#111214' : '#FFFFFF', pick: function () { self.setState({ sel: S.sel === p[2] ? null : p[2] }); } };
        all.push(rec); return rec; }) };
    });
    var p = all.filter(function (x) { return x.id === S.sel; })[0] || {};
    return {
      groups: groups, p: p, idle: !S.sel, picked: !!S.sel, unpick: function () { self.setState({ sel: null }); },
      modes: segs([['browse', 'Browse'], ['att', 'Attention', 15]], S.mode, function (k) { self.setState({ mode: k }); }),
      chips: barsegs([['all', 'All', 34, '#111214'], ['over', 'Overloaded', 7, '#E0479E'], ['nocon', 'No contact', 4, '#F5A524'], ['prob', 'Probation ending', 0, '#8B5CF6'], ['portal', 'Has portal', 30, '#19C37D'], ['noportal', 'No portal', 4, '#B9BBBF'], ['inactive', 'Inactive', 14, '#5B5E63']], S.chip, function (k) { self.setState({ chip: k }); })
    };
  }
}
'''
write('People.dc.html', head('People') + frame(inner, 'People', 'Add person', 'Most loaded', 'Shivam Parmar · 31 open tasks') + tail(script))

# ---------- One person ----------
def kv(k, v, grey=False):
    return '<div style="display: grid; grid-template-columns: 120px minmax(0, 1fr); column-gap: 10px; padding: 8px 0; border-bottom: 1px solid #F2F2EE; font-size: 13px"><span style="color: #8E9197">%s</span><span style="color: %s">%s</span></div>' % (k, '#A3A6AB' if grey else '#111214', v)

band = '''<div style="background: #141517; border-radius: 20px; padding: 18px 22px; color: #F2F2F0; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0; ''' + tex('rings') + '''">
<div style="display: flex; align-items: center; gap: 8px">
<a href="People.dc.html" style="height: 30px; padding: 0 10px; border-radius: 8px; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px">''' + ic('collapse', 13, 2.2) + '''People</a>
<span style="font-family: 'Geist Mono', monospace; font-size: 11px; padding: 4px 8px; border-radius: 6px; background: #26282C; color: #C9CBCF">OC-M01</span>
<span style="flex-grow: 1"></span>
''' + ''.join('<button type="button" style="height: 32px; padding: 0 11px; border-radius: 9px; border: 1px solid #2E3035; background: transparent; color: #E6E6E3; font-size: 12px; display: flex; align-items: center; gap: 6px">%s%s</button>' % (ic(i, 13), l) for i, l in [('mail', 'Email'), ('wa', 'WhatsApp'), ('phone', 'Call'), ('chat', 'Chat'), ('plus', 'New task'), ('doc', 'Add document')]) + '''
<button type="button" style="height: 32px; padding: 0 12px; border-radius: 9px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px">''' + ic('bell', 13) + '''Remind about open work</button>
<button type="button" aria-label="More" style="width: 32px; height: 32px; border-radius: 9px; border: 1px solid #2E3035; background: transparent; color: #E6E6E3; display: flex; align-items: center; justify-content: center">''' + ic('more', 14) + '''</button></div>
<div style="display: flex; align-items: flex-end; gap: 18px">
<span style="width: 64px; height: 64px; border-radius: 32px; background: #9FE2C2; color: #111214; font-size: 20px; font-weight: 600; display: flex; align-items: center; justify-content: center">JS</span>
<div style="flex-grow: 1"><div style="font-size: 36px; font-weight: 500; letter-spacing: -0.03em; line-height: 1">Mr Jitesh Solanki</div><div style="font-size: 14px; color: #A3A6AB; margin-top: 8px">CFO · Oracle Consultancy Ltd and 8 more · reports to Pulin Manek</div></div>
<div style="display: flex; gap: 6px">''' + pill('Active') + pill('Manager portal', '#9CC8F5', '#1B2633', '#2490EF') + '''</div></div>
<div style="display: flex; gap: 2px">''' + ''.join('<span style="height: 32px; padding: 0 12px; border-radius: 9px; font-size: 13px; display: flex; align-items: center; gap: 6px; %s">%s<span style="color: #8E9197; font-size: 12px">%s</span></span>' % ('background: #F2F2F0; color: #111214' if i == 0 else 'color: #C9CBCF', l, n) for i, (l, n) in enumerate([('Overview', ''), ('Tasks', '25'), ('Documents', ''), ('Journey', ''), ('Equipment', ''), ('Notes', ''), ('History', ''), ('Edit', '')])) + '''</div>
</div>'''

tiles = '<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px">' + ''.join('<div style="border-radius: 14px; background: #FFFFFF; padding: 14px"><div style="font-size: 28px; letter-spacing: -0.03em; color: %s">%s</div><div style="font-size: 12px; color: #6E7177">%s</div></div>' % t for t in [('#111214', '25', 'open tasks'), ('#C2327F', '6', 'overdue'), ('#111214', '12', 'finished in Sept'), ('#111214', '2', 'direct reports')]) + '</div>'

role = white_card(wcard_title('Role & companies', '<span>Edit</span>') + '<div style="margin-top: 6px">' + kv('Job title', 'CFO') + kv('Main company', 'Oracle Consultancy Ltd') + kv('Also works for', '8 more companies') + kv('Reports to', 'Pulin Manek') + kv('Also reports to', '—', True) + kv('Department', 'Not set', True) + kv('Started', 'Not set', True) + '</div>')
contact = white_card(wcard_title('Contact', '<span>Edit</span>') + '<div style="margin-top: 6px">' + kv('Email', 'On file') + kv('Phone · WhatsApp', 'On file') + kv('Prefers', 'Not set', True) + kv('Works at', 'Not set', True) + kv('Lives at', 'Not set', True) + '</div><div style="margin-top: 10px; font-size: 12px; color: #8E9197; display: flex; justify-content: space-between"><span>Personal — date of birth, ID, passport, emergency contact</span>' + ic('down', 12) + '</div>')
portal = white_card(wcard_title('Portal access', '<span>Manager</span>') + '<div style="font-size: 13px; color: #55585E; margin-top: 6px; line-height: 1.5">Signs in at the staff portal. Sees their own tasks and their team’s.</div><div style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap"><span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">Change level</span><span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">Reset password</span><span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #F5C6DF; color: #C2327F; font-size: 12px; display: flex; align-items: center">Revoke</span></div>')
reports = white_card(wcard_title('Direct reports', '<span>2</span>') + '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px">' + ''.join('<div style="display: flex; align-items: center; gap: 10px">%s<span style="flex-grow: 1; font-size: 13px">%s<span style="display: block; font-size: 11px; color: #8E9197">%s</span></span><span style="font-size: 12px; color: %s">%s</span></div>' % (avatar(i, 32), n, r, c, l) for i, n, r, c, l in [('DB', 'Diptobrato Bagchi', 'Business Development Manager · DSC', '#C2327F', '1 late'), ('VP', 'Vishal Pragji', 'TRA and Government Spokesperson · DSC', '#55585E', '13 open')]) + '</div>')
journey = white_card(wcard_title('Journey & equipment') + '<div style="font-size: 13px; color: #55585E; margin-top: 6px; line-height: 1.5">No onboarding or leaving checklist running, and no equipment signed out.</div><div style="display: flex; gap: 6px; margin-top: 12px"><span style="height: 30px; padding: 0 10px; border-radius: 8px; background: #111214; color: #FFFFFF; font-size: 12px; display: flex; align-items: center">Start onboarding</span><span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">Assign equipment</span></div>', texture='paper-dots')
tasks = white_card(wcard_title('Open tasks', '<a href="Main.dc.html" style="color: #111214">All 25 →</a>') + '<div style="display: flex; flex-direction: column; margin-top: 6px">' + ''.join('<div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; padding: 8px 0; border-bottom: 1px solid #F2F2EE; font-size: 13px"><span><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">%s</span> %s</span><span style="color: %s; font-size: 12px">%s</span></div>' % t for t in [('CC-026', 'Cocofix Payment', '#C2327F', '2d late'), ('DS-041', 'Cash flow planning meeting', '#C2327F', '2d late'), ('CC-002', 'Bank and TRA Machine Reconciliation', '#B7700A', 'Sat 26'), ('VI-006', 'CCTV, Fridge, Storage, Chillers etc', '#B7700A', 'Sat 26'), ('PE-028', 'itrust account opening', '#A3A6AB', 'no date')]) + '</div>')
facts = white_card(wcard_title('Tracked facts', '<span>with their source</span>') + '<div style="font-size: 13px; color: #55585E; margin-top: 6px; line-height: 1.5">Contract, passport, bank and other facts — each dated, sourced and kept with its history, never overwritten.</div><div style="display: flex; gap: 6px; margin-top: 12px"><span style="height: 30px; padding: 0 10px; border-radius: 8px; background: #111214; color: #FFFFFF; font-size: 12px; display: flex; align-items: center">Record a fact</span><span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">Documents on file</span></div>', 'flex-grow: 1', 'paper-rings')
danger = white_card('<div style="display: flex; align-items: center; gap: 10px"><div style="flex-grow: 1"><div style="font-size: 14px; font-weight: 600">Danger zone</div><div style="font-size: 12px; color: #8E9197; margin-top: 2px">Snooze, deactivate, or delete for good (asks you to type the name).</div></div><span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">Deactivate</span><span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #F5C6DF; color: #C2327F; font-size: 12px; display: flex; align-items: center">Delete…</span></div>', 'padding: 14px 18px')

body = '''<div style="flex-grow: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 16px">
<div style="display: flex; flex-direction: column; gap: 16px; min-height: 0">''' + tiles + tasks + facts + '''</div>
<div style="display: flex; flex-direction: column; gap: 16px; min-height: 0">''' + role + contact + '''</div>
<div style="display: flex; flex-direction: column; gap: 16px; min-height: 0">''' + portal + reports + journey + danger + '''</div>
</div>'''
write('Person.dc.html', head('People — one person') + frame(band + body, 'People', 'Add person', 'Record', 'Mr Jitesh Solanki · OC-M01', pad='16px', gap=16) + tail('class Component extends DCLogic { renderVals() { return {}; } }'))
