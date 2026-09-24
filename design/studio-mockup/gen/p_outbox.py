from kit import *

left = dark_card(card_title('Today', '<span>Across every company</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 28px">
<div>''' + big('19', 'to chase') + '''<div style="display: flex; gap: 14px; margin-top: 12px; font-size: 12px; color: #A3A6AB"><span>22 drafts waiting</span><span>1 sent</span></div></div>
<div style="flex-grow: 1"></div>''' + ring(0, 116, 12, '#19C37D', '#26282C', '0%', 'done today') + '''
</div>''')

cats = [('Task reminders', 'held'), ('Overdue safety net', 'held'), ('Renewals', 'held'), ('Weekly Director Brief', 'held'), ('Morning digest', 'held'), ('Probation &amp; leave', 'held')]
cat_html = ''.join('<div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; padding: 5px 0; border-bottom: 1px solid #222428"><span style="color: #C9CBCF">%s</span><span style="color: #8E9197">%s</span></div>' % c for c in cats)
right = dark_card(card_title('Automatic sending', pill('Paused', '#F5B94E', '#3A2E14', '#F5A524')) + '''
<div style="flex-grow: 1; display: grid; grid-template-columns: minmax(0, 1fr) 180px; column-gap: 24px; align-items: end">
<div>''' + cat_html + '''</div>
<div style="display: flex; flex-direction: column; gap: 8px"><div style="font-size: 12px; color: #8E9197; line-height: 1.45">Nothing goes out on its own while paused. The send window, daily cap and each category live in Settings.</div>
<a href="Settings.dc.html" style="height: 32px; border-radius: 9px; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center">Manage in Settings</a></div>
</div>''', texture='hatch')

lst = '''<div style="width: 420px; flex-shrink: 0; background: #FFFFFF; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden">
<div style="padding: 12px 14px; border-bottom: 1px solid #F0F0EC; display: flex; gap: 8px; align-items: center"><label style="flex-grow: 1; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border-radius: 10px; background: #F3F3F1; color: #8E9197">''' + ic('search', 14) + sr('Search') + '''<input placeholder="Search people or drafts" style="border: 0; outline: none; background: transparent; font: inherit; font-size: 13px; width: 100%"></label>''' + chip('All companies') + '''</div>
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; padding: 6px">
<sc-for list="{{items}}" as="i" hint-placeholder-count="8"><button type="button" onClick="{{i.pick}}" style="width: 100%; display: grid; grid-template-columns: 10px 32px minmax(0, 1fr) auto; column-gap: 10px; align-items: center; padding: 9px 10px; border: 0; border-radius: 12px; background: {{i.bg}}; text-align: left">
<span style="width: 8px; height: 8px; border-radius: 4px; background: {{i.dot}}"></span>
<span style="width: 32px; height: 32px; border-radius: 16px; background: {{i.av}}; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center">{{i.ini}}</span>
<span style="min-width: 0"><span style="display: block; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{i.name}}</span><span style="display: block; font-size: 11px; color: #8E9197; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{i.sub}}</span></span>
<span style="font-size: 11px; color: #55585E; background: #F3F3F1; border-radius: 6px; padding: 3px 7px">{{i.kind}}</span></button></sc-for>
</div>
<div style="padding: 10px 16px; border-top: 1px solid #F0F0EC; font-size: 12px; color: #8E9197; display: flex; justify-content: space-between"><span>Snoozed today · 0</span><span>41 in all</span></div>
</div>'''

detail_rem = '''<sc-if value="{{isRem}}" hint-placeholder-val="{{ true }}"><div style="display: flex; flex-direction: column; height: 100%; gap: 14px; animation: pop 200ms ease-out">
<div style="display: flex; align-items: center; gap: 12px"><span style="width: 44px; height: 44px; border-radius: 22px; background: {{d.av}}; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center">{{d.ini}}</span>
<div style="flex-grow: 1"><div style="font-size: 20px; font-weight: 500; letter-spacing: -0.01em">{{d.name}}</div><div style="font-size: 12px; color: #8E9197">{{d.chased}}</div></div>
<div style="display: flex; gap: 8px">''' + '''<sc-for list="{{d.tiles}}" as="t" hint-placeholder-count="3"><div style="border-radius: 12px; background: #F3F3F1; padding: 8px 12px; min-width: 70px"><div style="font-size: 20px; letter-spacing: -0.02em; color: {{t.c}}">{{t.n}}</div><div style="font-size: 11px; color: #6E7177">{{t.l}}</div></div></sc-for></div></div>
<div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 16px; flex-grow: 1; min-height: 0">
<div style="display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto"><div style="font-size: 12px; color: #6E7177">In this reminder</div>
<sc-for list="{{d.tasks}}" as="t" hint-placeholder-count="5"><div style="display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; border: 1px solid #F0F0EC"><span style="min-width: 0"><span style="font-family: 'Geist Mono', monospace; font-size: 11px; color: #8E9197">{{t.code}}</span> <span style="font-size: 13px">{{t.title}}</span></span><span style="font-size: 12px; color: {{t.c}}; white-space: nowrap">{{t.due}}</span></div></sc-for></div>
<div style="display: flex; flex-direction: column; gap: 8px; min-height: 0"><div style="font-size: 12px; color: #6E7177">Message — edit anything before it goes</div>
<div style="flex-grow: 1; border-radius: 12px; background: #FAFAF8; border: 1px solid #EFEFEB; padding: 12px 14px; font-size: 13px; line-height: 1.55; color: #333; white-space: pre-line; overflow: hidden">{{d.msg}}</div>
<div style="height: 36px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; align-items: center; padding: 0 12px; font-size: 13px; color: #8E9197">Add a personal line at the top (email only)…</div></div>
</div>
<div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0">
<button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Skip today</button>
<button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px; display: flex; align-items: center; gap: 6px">''' + ic('copy', 14) + '''Copy &amp; done</button>
<button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Mark done</button>
<span style="flex-grow: 1"></span>
<button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px; display: flex; align-items: center; gap: 6px">''' + ic('wa', 15) + '''WhatsApp</button>
<button type="button" style="height: 38px; padding: 0 18px; border-radius: 10px; border: 0; background: #111214; color: #FFFFFF; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px">''' + ic('mail', 15) + '''Send email</button>
</div></div></sc-if>'''

detail_draft = '''<sc-if value="{{isDraft}}" hint-placeholder-val="{{ false }}"><div style="display: flex; flex-direction: column; height: 100%; gap: 12px; animation: pop 200ms ease-out">
<div style="display: flex; align-items: center; gap: 8px">''' + lpill('Written by an automation', '#8B5CF6') + '''<span style="font-size: 12px; color: #8E9197">Overdue-task safety net · to {{d.name}}</span></div>
''' + field('Subject', box('You have tasks past their deadline')) + '''
<div style="flex-grow: 1; border-radius: 12px; border: 1px solid #E4E4E0; padding: 12px 14px; font-size: 13px; line-height: 1.55; color: #333; white-space: pre-line">{{d.msg}}</div>
<div style="display: flex; gap: 8px"><button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #F5C6DF; background: #FFFFFF; color: #C2327F; font-size: 13px">Discard</button><button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Copy</button><button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Mark sent</button><span style="flex-grow: 1"></span><button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Open WhatsApp</button><button type="button" style="height: 38px; padding: 0 18px; border-radius: 10px; border: 0; background: #111214; color: #FFFFFF; font-size: 13px; font-weight: 600">Send email</button></div>
</div></sc-if>'''

detail = '<div style="flex-grow: 1; min-width: 0; background: #FFFFFF; border-radius: 20px; padding: 20px 22px; box-sizing: border-box">' + detail_rem + detail_draft + '</div>'
body = '<div style="flex-grow: 1; min-height: 0; display: flex; gap: 20px">' + lst + detail + '</div>'

inner = header('Outbox', '', seg_dyn('tabs') + ghost_btn('Sent log', 'history') + dark_btn('Send all email · 19', 'send')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 210px; flex-shrink: 0">' + left + right + '</div>' + body

script = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { tab: 'all', sel: 'JS' }; }
  renderVals() {
    var S = this.state, self = this;
    var P = [
      ['JS', 'Mr Jitesh Solanki', 25, 6, 'chased 3h ago', 'r'], ['PM', 'Mr Pulin Manek', 12, 8, 'chased 5d ago', 'r'], ['SP', 'Mr Shivam Parmar', 31, 1, 'chased 1w ago', 'r'],
      ['GM', 'Mr Gangadhar Mathankar', 3, 3, 'not chased yet', 'r'], ['KS', 'Mr Kishan Suchak', 3, 3, 'not chased yet', 'r'], ['HS', 'Mr Hriday Solanki', 7, 1, 'not chased yet', 'r'],
      ['VP', 'Mr Vishal Pragji', 13, 0, 'not chased yet', 'r'], ['NV', 'Mr Nayan Vaghela', 2, 2, 'not chased yet', 'r'], ['AS', 'Mr Amal Somaiya', 3, 1, 'not chased yet', 'r'],
      ['DB', 'Mr Diptobrato Bagchi', 1, 1, 'Plan Of Action', 'r'], ['OM', 'Ops Manager', 3, 3, 'not chased yet', 'r'],
      ['HB', 'Hiral', 0, 0, 'Overdue-task safety net', 'd'], ['JS2', 'Jitesh Solanki', 0, 0, 'Overdue-task safety net', 'd'], ['PR', 'Parin Manek', 0, 0, 'Overdue-task safety net', 'd'], ['HS2', 'Hriday Solanki', 0, 0, 'Overdue-task safety net', 'd']
    ];
    var list = P.filter(function (p) { return S.tab === 'all' || (S.tab === 'rem' && p[5] === 'r') || (S.tab === 'draft' && p[5] === 'd'); });
    var items = list.map(function (p) {
      var ini = p[0].replace(/2$/, '');
      return { ini: ini, av: av(ini), name: p[1], kind: p[5] === 'r' ? 'Reminder' : 'Draft',
        sub: p[5] === 'r' ? (p[2] ? p[2] + ' tasks' + (p[3] ? ' · ' + p[3] + ' overdue' : '') + ' · ' + p[4] : p[4]) : p[4],
        dot: p[5] === 'd' ? '#8B5CF6' : (p[3] >= 3 ? '#E0479E' : (p[3] ? '#F5A524' : '#19C37D')),
        bg: S.sel === p[0] ? '#F3F3F1' : 'transparent', pick: function () { self.setState({ sel: p[0] }); } };
    });
    var cur = P.filter(function (p) { return p[0] === S.sel; })[0] || P[0];
    var ini = cur[0].replace(/2$/, '');
    var T = {
      JS: [['CC-026', 'Cocofix Payment', '2d late', 1], ['DS-041', 'Cash flow planning meeting', '2d late', 1], ['CC-002', 'Bank and TRA Machine Reconciliation', 'Sat 26', 2], ['VI-006', 'CCTV, Fridge, Storage, Chillers etc', 'Sat 26', 2], ['PE-028', 'itrust account opening', 'no date', 0], ['DS-045', 'DSC Debtor Reports', 'no date', 0]],
      PM: [['PE-026', 'ERP meeting', '2d late', 1], ['DS-041', 'Cash flow planning meeting', '2d late', 1], ['CC-022', 'Plan Of Action', '1d late', 1], ['PE-029', 'Update on WTP costs', 'no date', 0]]
    };
    var tasks = (T[ini] || T.JS).map(function (t) { return { code: t[0], title: t[1], due: t[2], c: t[3] === 1 ? '#C2327F' : (t[3] === 2 ? '#B7700A' : '#A3A6AB') }; });
    var first = cur[1].replace(/^(Mr|Ms|Mrs) /, '').split(' ')[0];
    var msg = 'Hi ' + first + ',\n\nA quick round-up of your open tasks. ' + (cur[3] ? cur[3] + ' are past their deadline — could you post an update on each today?' : 'Nothing is late — thank you.') + '\n\n• ' + tasks.slice(0, 3).map(function (t) { return t.code + ' ' + t.title + ' (' + t.due + ')'; }).join('\n• ') + '\n\nThank you.';
    var d = { ini: ini, av: av(ini), name: cur[1], chased: 'Last chased: ' + cur[4].replace('chased ', ''), tasks: tasks, msg: msg,
      tiles: [{ n: cur[2] || 0, l: 'open', c: '#111214' }, { n: cur[3] || 0, l: 'overdue', c: cur[3] ? '#C2327F' : '#111214' }, { n: tasks.filter(function (t) { return t.due.indexOf('Sat') === 0; }).length, l: 'due soon', c: '#B7700A' }] };
    return {
      items: items, d: d, isRem: cur[5] === 'r', isDraft: cur[5] === 'd',
      tabs: segs([['all', 'All', 41], ['rem', 'Reminders', 19], ['draft', 'Drafts', 22], ['sent', 'Sent', 1]], S.tab, function (k) { self.setState({ tab: k }); })
    };
  }
}
'''
write('Outbox.dc.html', head('Outbox') + frame(inner, 'Outbox', 'New task', 'Most urgent', 'Pulin Manek · 8 overdue · chased 5 days ago') + tail(script))
