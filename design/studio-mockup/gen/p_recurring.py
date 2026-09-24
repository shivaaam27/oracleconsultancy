from kit import *

switch = '<button type="button" role="switch" aria-checked="{{r.live}}" aria-label="Rule on or off" onClick="{{r.toggle}}" style="width: 36px; height: 22px; border-radius: 11px; border: 0; padding: 0; background: {{r.track}}; position: relative; flex-shrink: 0"><span style="position: absolute; top: 3px; left: {{r.knob}}; width: 16px; height: 16px; border-radius: 8px; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0,0,0,0.25)"></span></button>'

cols = 'minmax(0, 1.6fr) 196px 128px 128px 150px 36px 64px'

left = dark_card(
    card_title('This week', '<span>Thu 24 Sept</span>') +
    '''<div style="flex-grow: 1; display: grid; grid-template-columns: 220px minmax(0, 1fr); column-gap: 28px; align-items: end">
<div>''' + big('12', 'rules') + '''<div style="margin-top: 14px">''' + pill('{{liveLabel}}') + '''</div>
<div style="font-size: 12px; color: #8E9197; margin-top: 10px">7 weekly · 5 monthly</div></div>
<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; align-items: end; height: 132px">
<sc-for list="{{week}}" as="d" hint-placeholder-count="7"><div style="display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end">
<span style="font-size: 12px; color: {{d.numC}}">{{d.n}}</span>
<span style="width: 100%; max-width: 34px; height: {{d.h}}; border-radius: 6px; background: {{d.c}}; transform-origin: bottom; animation: rise 600ms cubic-bezier(.2,.8,.2,1) both; animation-delay: {{d.delay}}"></span>
<span style="font-size: 11px; color: {{d.labC}}">{{d.label}}</span>
</div></sc-for>
</div></div>''', texture=None)

right_idle = '''<sc-if value="{{idle}}" hint-placeholder-val="{{ true }}"><div style="display: flex; flex-direction: column; height: 100%; animation: pop 220ms ease-out">''' + card_title('Next up', 'Pick a rule to see it here') + '''
<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px">
<sc-for list="{{nextUp}}" as="n" hint-placeholder-count="4"><button type="button" onClick="{{n.pick}}" style="display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; column-gap: 12px; align-items: center; text-align: left; border: 1px solid #26282C; background: rgba(20,21,23,0.85); border-radius: 12px; padding: 9px 12px; color: #F2F2F0">
<span style="font-size: 12px; color: {{n.whenC}}">{{n.when}}</span><span style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{n.title}}</span><span style="font-size: 11px; color: #8E9197; white-space: nowrap">{{n.co}}</span></button></sc-for>
</div></div></sc-if>'''

right_sel = '''<sc-if value="{{picked}}" hint-placeholder-val="{{ false }}"><div style="display: flex; flex-direction: column; height: 100%; gap: 10px; animation: pop 200ms ease-out">
<div style="display: flex; align-items: center; gap: 8px; height: 26px"><span style="font-size: 12px; color: #A3A6AB; flex-grow: 1">{{sel.co}} · set up by {{sel.by}}</span>
<button type="button" onClick="{{openEdit}}" aria-label="Edit this rule" style="width: 28px; height: 28px; border-radius: 8px; background: #F2F2F0; color: #111214; border: 0; display: flex; align-items: center; justify-content: center">''' + ic('pencil', 13) + '''</button>
<button type="button" onClick="{{unpick}}" aria-label="Close" style="width: 28px; height: 28px; border-radius: 8px; border: 1px solid #2E3035; background: transparent; color: #C9CBCF; display: flex; align-items: center; justify-content: center">''' + ic('x', 12, 2.4) + '''</button></div>
<div style="font-size: 24px; font-weight: 500; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{sel.title}}</div>
<div style="font-size: 14px; color: #C9CBCF">Creates this task {{sel.sentence}}</div>
<div style="flex-grow: 1"></div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">
<sc-for list="{{sel.next3}}" as="d" hint-placeholder-count="3"><div style="border: 1px solid #2A2C30; background: #1A1B1E; border-radius: 12px; padding: 10px 12px"><div style="font-size: 11px; color: #8E9197">{{d.label}}</div><div style="font-size: 15px; margin-top: 2px">{{d.date}}</div></div></sc-for>
</div>
<div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8E9197"><span style="flex-grow: 1">Last created a task: {{sel.last}}</span><button type="button" style="height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid #34363B; background: transparent; color: #E6E6E3; font-size: 12px">Open its tasks</button></div>
</div></sc-if>'''

right = dark_card(right_idle + right_sel, texture='rings')

rows = '''<div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column">
<div style="display: grid; grid-template-columns: ''' + cols + '''; column-gap: 20px; padding: 0 20px 8px; font-size: 12px; color: #6E7177; flex-shrink: 0">
<span>Rule</span><span>Repeats</span><span style="color: #111214; font-weight: 500">Next task</span><span>Last created</span><span>Set up by</span><span>On</span><span></span></div>
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px">
<sc-for list="{{rows}}" as="r" hint-placeholder-count="8">
<div style="flex-shrink: 0; display: grid; grid-template-columns: ''' + cols + '''; column-gap: 20px; align-items: center; background: #FFFFFF; border-radius: 14px; padding: 12px 20px; border: 1.5px solid {{r.ring}}; opacity: {{r.op}}">
<button type="button" onClick="{{r.pick}}" style="border: 0; background: transparent; padding: 0; text-align: left; min-width: 0">
<span style="display: block; font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{r.title}}</span>
<span style="display: block; font-size: 12px; color: #8E9197; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{r.co}}</span></button>
<div style="display: flex; gap: 3px; align-items: center">
<sc-if value="{{r.weekly}}" hint-placeholder-val="{{ true }}"><sc-for list="{{r.days}}" as="d" hint-placeholder-count="7"><span style="width: 22px; height: 22px; border-radius: 6px; background: {{d.bg}}; color: {{d.fg}}; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center">{{d.l}}</span></sc-for></sc-if>
<sc-if value="{{r.monthly}}" hint-placeholder-val="{{ false }}"><span style="height: 24px; padding: 0 10px; border-radius: 7px; background: #111214; color: #FFFFFF; font-size: 12px; display: flex; align-items: center; gap: 6px">''' + ic('cal', 12) + '''Day {{r.dom}} · monthly</span></sc-if>
</div>
<div style="font-size: 13px; color: {{r.nextC}}; font-weight: {{r.nextW}}">{{r.next}}</div>
<div style="font-size: 13px; color: #55585E">{{r.last}}</div>
<div style="font-size: 12px; color: #55585E; display: flex; align-items: center; gap: 6px"><span style="width: 6px; height: 6px; border-radius: 3px; background: {{r.byDot}}"></span>{{r.by}}</div>
''' + switch + '''
<div style="display: flex; gap: 2px; justify-content: flex-end">
<button type="button" onClick="{{r.edit}}" aria-label="Edit rule" style="width: 30px; height: 30px; border-radius: 8px; border: 0; background: transparent; color: #8E9197; display: flex; align-items: center; justify-content: center">''' + ic('pencil', 14) + '''</button>
<button type="button" onClick="{{r.askRemove}}" aria-label="Remove rule" style="width: 30px; height: 30px; border-radius: 8px; border: 0; background: transparent; color: #8E9197; display: flex; align-items: center; justify-content: center">''' + ic('trash', 14) + '''</button>
</div>
</div>
<sc-if value="{{r.confirming}}" hint-placeholder-val="{{ false }}"><div style="flex-shrink: 0; margin-top: -4px; display: flex; align-items: center; gap: 10px; background: #FFF4F9; border: 1px solid #F5C6DF; border-radius: 12px; padding: 10px 16px; font-size: 13px; animation: pop 160ms ease-out"><span style="flex-grow: 1">Remove this rule? Tasks it already created stay. Switching it off keeps its settings instead.</span><button type="button" onClick="{{r.cancelRemove}}" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 12px">Keep it</button><button type="button" onClick="{{r.remove}}" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 0; background: #C2327F; color: #FFFFFF; font-size: 12px">Remove</button></div></sc-if>
</sc-for>
</div></div>'''

field = lambda label, inner: '<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 12px; color: #6E7177">%s</span>%s</div>' % (label, inner)
box = lambda v, ph=False: '<div style="height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; display: flex; align-items: center; padding: 0 12px; font-size: 13px; color: %s">%s</div>' % ('#8E9197' if ph else '#111214', v)

sheet = '''<sc-if value="{{editing}}" hint-placeholder-val="{{ false }}">
<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(14,15,16,0.28); z-index: 5"></div>
<div style="position: absolute; top: 16px; right: 16px; bottom: 16px; width: 480px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 24px 60px rgba(17,18,20,0.25); z-index: 6; display: flex; flex-direction: column; overflow: hidden; animation: pop 200ms ease-out">
<div style="padding: 18px 20px; border-bottom: 1px solid #EEEEEA; display: flex; align-items: center; justify-content: space-between"><div><div style="font-size: 18px; font-weight: 600">{{sheetTitle}}</div><div style="font-size: 12px; color: #8E9197">Makes a fresh task on the days you choose</div></div>
<button type="button" onClick="{{closeEdit}}" aria-label="Close" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; display: flex; align-items: center; justify-content: center">''' + ic('x', 14, 2.2) + '''</button></div>
<div style="flex-grow: 1; overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 16px">
''' + field('What needs to be done?', box('{{form.title}}')) + '''
''' + field('Company', box('{{form.co}}')) + '''
''' + field('Repeats', '<div style="display: flex; gap: 6px"><sc-for list="{{form.modes}}" as="m" hint-placeholder-count="2"><button type="button" onClick="{{m.pick}}" style="height: 34px; padding: 0 16px; border-radius: 10px; border: 1px solid {{m.border}}; background: {{m.bg}}; color: {{m.fg}}; font-size: 13px">{{m.label}}</button></sc-for></div>') + '''
<sc-if value="{{form.weekly}}" hint-placeholder-val="{{ true }}">''' + field('On these days', '<div style="display: flex; gap: 6px"><sc-for list="{{form.days}}" as="d" hint-placeholder-count="7"><button type="button" onClick="{{d.pick}}" aria-pressed="{{d.on}}" style="width: 40px; height: 36px; border-radius: 10px; border: 1px solid {{d.border}}; background: {{d.bg}}; color: {{d.fg}}; font-size: 12px; font-weight: 500">{{d.l}}</button></sc-for></div>') + '''</sc-if>
<sc-if value="{{form.monthly}}" hint-placeholder-val="{{ false }}">''' + field('Day of the month', box('{{form.dom}}')) + '''</sc-if>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">''' + field('Priority', box('Medium')) + field('Starting status', box('Not Started')) + '''</div>
''' + field('Assign to', '<div style="min-height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 5px 8px"><span style="height: 26px; padding: 0 8px 0 4px; border-radius: 13px; background: #F3F3F1; display: flex; align-items: center; gap: 6px; font-size: 12px">' + avatar('JS', 20, '#F3F3F1') + 'Jitesh Solanki ' + ic('x', 10, 2.4) + '</span><span style="font-size: 12px; color: #8E9197">Add someone…</span></div>') + '''
''' + field('Description', '<div style="height: 70px; border-radius: 10px; border: 1px solid #E4E4E0; padding: 10px 12px; font-size: 13px; color: #8E9197; box-sizing: border-box">Becomes the task’s comments</div>') + '''
<div style="border-radius: 12px; background: #F3F3F1; padding: 12px 14px; font-size: 13px; line-height: 1.5"><span style="color: #6E7177">In plain words:</span> creates “{{form.title}}” for {{form.coText}} {{form.sentence}}. Next one: <b style="font-weight: 600">{{form.next}}</b>.</div>
</div>
<div style="padding: 14px 20px; border-top: 1px solid #EEEEEA; display: flex; gap: 8px; justify-content: flex-end"><button type="button" onClick="{{closeEdit}}" style="height: 38px; padding: 0 16px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Cancel</button><button type="button" onClick="{{closeEdit}}" style="height: 38px; padding: 0 18px; border-radius: 10px; border: 0; background: #111214; color: #FFFFFF; font-size: 13px; font-weight: 600">Save rule</button></div>
</div></sc-if>'''

inner = header('Recurring', chip('All companies'), seg_dyn('segs') + dark_btn('New rule', onclick='openNew')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 244px; flex-shrink: 0">' + left + right + '</div>' + rows + sheet

script = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { sel: null, seg: 'all', off: {}, editing: false, form: null, confirm: null, removed: {} }; }
  renderVals() {
    var S = this.state, self = this, set = function (o) { self.setState(o); };
    var D = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    var R = [
      ['PES Operations and Logistics Report', 'PES Ltd', 'w', [3], 'Thu 1 Oct', 'Today, 06:00', 'Owner via Claude', ['Thu 1 Oct', 'Thu 8 Oct', 'Thu 15 Oct']],
      ['DSC Debtor Reports', 'DSC Ltd', 'w', [0, 2, 4], 'Fri 25 Sept', '1 day ago', 'Owner via Claude', ['Fri 25 Sept', 'Mon 28 Sept', 'Wed 30 Sept']],
      ['DSC Reports - shipments, orders etc.', 'DSC Ltd', 'w', [0, 2, 4], 'Fri 25 Sept', '1 day ago', 'Owner via Claude', ['Fri 25 Sept', 'Mon 28 Sept', 'Wed 30 Sept']],
      ['Dar Distributors Instagram Plan', 'Dar Distributors', 'm', 27, 'Sun 27 Sept', 'Not yet', 'Administrator', ['Sun 27 Sept', 'Tue 27 Oct', 'Fri 27 Nov']],
      ['MIS Reports - Weekly', 'DSC Ltd', 'w', [2], 'Wed 30 Sept', 'Wed 23 Sept', 'Owner via Claude', ['Wed 30 Sept', 'Wed 7 Oct', 'Wed 14 Oct']],
      ['MIS Reports - Weekly', 'PES Ltd', 'w', [2], 'Wed 30 Sept', 'Wed 23 Sept', 'Owner via Claude', ['Wed 30 Sept', 'Wed 7 Oct', 'Wed 14 Oct']],
      ['MIS Reports - Weekly', 'Terra Green Ltd', 'w', [2], 'Wed 30 Sept', 'Wed 23 Sept', 'Owner via Claude', ['Wed 30 Sept', 'Wed 7 Oct', 'Wed 14 Oct']],
      ['MIS Reports - Weekly', 'Furaha Innovation Ltd', 'w', [2], 'Wed 30 Sept', 'Wed 23 Sept', 'Owner via Claude', ['Wed 30 Sept', 'Wed 7 Oct', 'Wed 14 Oct']],
      ['Stock Taking - PES Godown', 'PES Ltd', 'm', 30, 'Wed 30 Sept', '25 days ago', 'Owner via Claude', ['Wed 30 Sept', 'Fri 30 Oct', 'Mon 30 Nov']],
      ['Official MIS Monthly Reports', 'DSC Ltd', 'm', 1, 'Thu 1 Oct', 'Not yet', 'Administrator', ['Thu 1 Oct', 'Sun 1 Nov', 'Tue 1 Dec']],
      ['Monthly Stock Reports - site visit, verification and sign-off', 'Oracle Consultancy Ltd', 'm', 5, 'Mon 5 Oct', 'Not yet', 'Owner via Claude', ['Mon 5 Oct', 'Thu 5 Nov', 'Sat 5 Dec']],
      ['PES Extensive Reports', 'PES Ltd', 'm', 7, 'Wed 7 Oct', '17 days ago', 'Owner via Claude', ['Wed 7 Oct', 'Sat 7 Nov', 'Mon 7 Dec']]
    ];
    var sentence = function (r) { return r[2] === 'w' ? 'every ' + r[3].map(function (i) { return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]; }).join(', ') : 'on day ' + r[3] + ' of each month'; };
    var list = R.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) {
      if (S.removed[x.i]) return false;
      if (S.seg === 'w') return x.r[2] === 'w';
      if (S.seg === 'm') return x.r[2] === 'm';
      return true;
    });
    var openFor = function (x) {
      var r = x ? x.r : ['', 'Choose a company', 'w', [0], '—'];
      set({ editing: true, form: { title: x ? r[0] : 'New recurring task', co: r[1], mode: r[2], days: r[2] === 'w' ? r[3].slice() : [0], dom: r[2] === 'm' ? r[3] : 1, isNew: !x } });
    };
    var rows = list.map(function (x) {
      var r = x.r, on = S.sel === x.i, live = !S.off[x.i];
      return {
        title: r[0], co: r[1], weekly: r[2] === 'w', monthly: r[2] === 'm', dom: r[3],
        days: D.map(function (l, i) { var hit = r[2] === 'w' && r[3].indexOf(i) >= 0; return { l: l, bg: hit ? '#111214' : '#F3F3F1', fg: hit ? '#FFFFFF' : '#B9BBBF' }; }),
        next: live ? r[4] : 'Paused', nextC: !live ? '#A3A6AB' : (r[4] === 'Today' ? '#111214' : '#111214'), nextW: r[4] === 'Today' ? '600' : '400',
        last: r[5], by: r[6], byDot: r[6] === 'Administrator' ? '#2490EF' : '#8B5CF6',
        live: live, track: live ? '#111214' : '#D6D6D2', knob: live ? '17px' : '3px', op: live ? '1' : '0.6',
        ring: on ? '#111214' : '#FFFFFF',
        pick: function () { set({ sel: on ? null : x.i }); },
        toggle: function () { var o = Object.assign({}, S.off); o[x.i] = live; set({ off: o }); },
        edit: function () { openFor(x); },
        confirming: S.confirm === x.i,
        askRemove: function () { set({ confirm: x.i }); }, cancelRemove: function () { set({ confirm: null }); },
        remove: function () { var o = Object.assign({}, S.removed); o[x.i] = true; set({ removed: o, confirm: null, sel: null }); }
      };
    });
    var counts = [2, 0, 6, 1, 2, 0, 1];
    var week = counts.map(function (n, i) { var today = i === 3; return { n: n, label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], h: Math.max(6, n * 16) + 'px', c: today ? '#F2F2F0' : (n ? '#19C37D' : '#2A2C30'), numC: n ? '#F2F2F0' : '#4A4D52', labC: today ? '#F2F2F0' : '#8E9197', delay: i * 60 + 'ms' }; });
    var nextUp = [[1, 'Fri 25 Sept', 'DSC Debtor Reports', 'DSC Ltd'], [2, 'Fri 25 Sept', 'DSC Reports - shipments, orders etc.', 'DSC Ltd'], [3, 'Sun 27 Sept', 'Dar Distributors Instagram Plan', 'Dar Distributors'], [4, 'Wed 30 Sept', 'MIS Reports - Weekly × 4 companies', 'DSC · PES · Terra Green · Furaha']]
      .map(function (n) { return { when: n[1], whenC: n[1] === 'Fri 25 Sept' ? '#5BE0A5' : '#A3A6AB', title: n[2], co: n[3], pick: function () { set({ sel: n[0] }); } }; });
    var sel = {};
    if (S.sel != null) {
      var r = R[S.sel];
      var n3 = r[7];
      sel = { title: r[0], co: r[1], by: r[6], sentence: sentence(r), last: r[5], next3: n3.map(function (d, i) { return { label: ['Next', 'Then', 'Then'][i], date: d }; }) };
    }
    var F = S.form || { title: '', co: '', mode: 'w', days: [0], dom: 1 };
    var form = {
      title: F.title, co: F.co, coText: F.isNew ? 'the company you choose' : F.co, weekly: F.mode === 'w', monthly: F.mode === 'm', dom: 'Day ' + F.dom,
      sentence: F.mode === 'w' ? 'every ' + F.days.slice().sort().map(function (i) { return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]; }).join(', ') : 'on day ' + F.dom + ' of each month',
      next: F.mode === 'w' ? 'the next ' + ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][F.days.slice().sort()[0] || 0] : 'day ' + F.dom,
      modes: [['w', 'Weekly'], ['m', 'Monthly']].map(function (m) { var on = F.mode === m[0]; return { label: m[1], bg: on ? '#111214' : '#FFFFFF', fg: on ? '#FFFFFF' : '#111214', border: on ? '#111214' : '#E4E4E0', pick: function () { set({ form: Object.assign({}, F, { mode: m[0] }) }); } }; }),
      days: D.map(function (l, i) { var on = F.days.indexOf(i) >= 0; return { l: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], on: on, bg: on ? '#111214' : '#FFFFFF', fg: on ? '#FFFFFF' : '#111214', border: on ? '#111214' : '#E4E4E0', pick: function () { var d = F.days.slice(); var k = d.indexOf(i); if (k >= 0) { if (d.length > 1) d.splice(k, 1); } else d.push(i); set({ form: Object.assign({}, F, { days: d }) }); } }; })
    };
    var liveN = R.length - Object.keys(S.off).filter(function (k) { return S.off[k]; }).length - Object.keys(S.removed).length;
    return {
      rows: rows, week: week, nextUp: nextUp, sel: sel, form: form,
      idle: S.sel == null, picked: S.sel != null, unpick: function () { set({ sel: null }); },
      liveLabel: liveN === R.length ? 'All live' : liveN + ' live',
      segs: segs([['all', 'All', 12], ['w', 'Weekly', 7], ['m', 'Monthly', 5]], S.seg, function (k) { set({ seg: k }); }),
      editing: S.editing, sheetTitle: S.form && S.form.isNew ? 'New recurring task' : 'Edit recurring task',
      openNew: function () { openFor(null); }, openEdit: function () { openFor({ r: R[S.sel], i: S.sel }); }, closeEdit: function () { set({ editing: false }); }
    };
  }
}
'''
write('Recurring.dc.html', head('Recurring tasks') + frame(inner, 'Recurring', 'New task', 'Next rule to fire', 'Fri 25 Sept · DSC Debtor Reports + DSC Reports') + tail(script))
