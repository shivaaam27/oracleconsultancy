from kit import *

monthnav = '''<div style="display: flex; align-items: center; gap: 4px; height: 36px; padding: 0 4px; border-radius: 11px; background: #FFFFFF; border: 1px solid #DEDED9">
<button type="button" aria-label="Previous" style="width: 28px; height: 28px; border-radius: 8px; border: 0; background: transparent; display: flex; align-items: center; justify-content: center">''' + ic('left', 13, 2.2) + '''</button>
<span style="font-size: 13px; font-weight: 500; padding: 0 6px">%s</span>
<button type="button" aria-label="Next" style="width: 28px; height: 28px; border-radius: 8px; border: 0; background: transparent; display: flex; align-items: center; justify-content: center">''' + ic('right', 13, 2.2) + '''</button></div>'''

# ---------- Attendance ----------
aleft = dark_card(card_title('Today · Thu 24 Sept', '<span>{{marked}} of 14 marked</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 24px">
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; flex-grow: 1">
<sc-for list="{{tally}}" as="t" hint-placeholder-count="4"><div><div style="font-size: 34px; letter-spacing: -0.03em; line-height: 1">{{t.n}}</div><div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #A3A6AB; margin-top: 6px"><span style="width: 7px; height: 7px; border-radius: 4px; background: {{t.c}}"></span>{{t.l}}</div></div></sc-for>
</div>
<div style="font-size: 12px; color: #8E9197; max-width: 180px; line-height: 1.5">Staff can check themselves in from the portal — those show a small dot.</div>
</div>''')
aright = dark_card(card_title('Public holidays', '<span>0 coming up</span>') + '''<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px"><div style="font-size: 22px; font-weight: 500; letter-spacing: -0.015em">No holidays added yet</div><div style="font-size: 13px; color: #A3A6AB; max-width: 440px; line-height: 1.5">Add each public holiday once — for every company or one — and it fills the register by itself and can’t be painted over.</div><div><button type="button" onClick="{{toHol}}" style="height: 32px; padding: 0 12px; border-radius: 9px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600">Add a holiday</button></div></div>''', texture='contour')

reg = '''<div style="flex-grow: 1; min-height: 0; background: #FFFFFF; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden">
<div style="display: flex; align-items: center; gap: 6px; padding: 12px 16px; border-bottom: 1px solid #F0F0EC"><span style="font-size: 12px; color: #6E7177; margin-right: 4px; display: flex; align-items: center; gap: 6px">''' + ic('brush', 14) + '''Paint</span>
<sc-for list="{{brushes}}" as="b" hint-placeholder-count="7"><button type="button" onClick="{{b.pick}}" aria-pressed="{{b.on}}" style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1.5px solid {{b.border}}; background: {{b.bg}}; font-size: 12px; display: flex; align-items: center; gap: 6px"><span style="width: 18px; height: 18px; border-radius: 5px; background: {{b.c}}; color: {{b.fg}}; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center">{{b.k}}</span>{{b.l}}</button></sc-for>
<span style="flex-grow: 1"></span><span style="font-size: 12px; color: #8E9197">Click a day to paint it · Sundays shaded · today outlined</span></div>
<div style="flex-grow: 1; min-height: 0; overflow: auto; padding: 8px 16px 12px">
<div style="display: grid; grid-template-columns: 190px repeat(30, minmax(0, 1fr)); gap: 3px; align-items: center">
<span style="font-size: 11px; color: #8E9197">Person</span>
<sc-for list="{{days}}" as="d" hint-placeholder-count="30"><span style="font-size: 10px; color: {{d.c}}; text-align: center; font-weight: {{d.w}}; line-height: 1.2">{{d.n}}<br>{{d.wd}}</span></sc-for>
<sc-for list="{{rows}}" as="r" hint-placeholder-count="14">
<span style="font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px">{{r.name}}</span>
<sc-for list="{{r.cells}}" as="c" hint-placeholder-count="30"><button type="button" onClick="{{c.paint}}" aria-label="{{c.label}}" style="height: 26px; border-radius: 5px; border: {{c.border}}; background: {{c.bg}}; color: {{c.fg}}; font-size: 10px; font-weight: 600; padding: 0">{{c.k}}</button></sc-for>
</sc-for>
</div></div></div>'''

hol = '''<div style="flex-grow: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px">
<div style="background: #FFFFFF; border-radius: 20px; display: flex; align-items: center; justify-content: center; ''' + tex('paper-rings') + '''"><div style="text-align: center; color: #55585E; font-size: 14px; background: #FFFFFF; padding: 14px 20px; border-radius: 12px">No holidays yet. Each one you add lists here with its date and company, and an ✕ to remove it.</div></div>
''' + white_card(wcard_title('Add a public holiday') + '<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px">' + field('Holiday name', box('e.g. Independence Day', True)) + field('Date', box('Pick a date', True, 'cal')) + field('Company', box('All companies', icon='building')) + '<span style="height: 40px; border-radius: 10px; background: #111214; color: #FFFFFF; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center">Add holiday</span></div>') + '''
</div>'''

ainner = header('Attendance', chip('All companies'), seg_dyn('views') + (monthnav % 'September 2026') + dark_btn('Mark all present today', 'check', onclick='markAll')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 196px; flex-shrink: 0">' + aleft + aright + '</div>' + \
    '<sc-if value="{{isReg}}" hint-placeholder-val="{{ true }}">' + reg + '</sc-if><sc-if value="{{isHol}}" hint-placeholder-val="{{ false }}">' + hol + '</sc-if>'

ascript = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { view: 'reg', brush: 'P', marks: {} }; }
  renderVals() {
    var S = this.state, self = this;
    var B = [['P', 'Present', '#19C37D', '#FFFFFF'], ['A', 'Absent', '#E0479E', '#FFFFFF'], ['L', 'On leave', '#2490EF', '#FFFFFF'], ['R', 'Remote', '#8B5CF6', '#FFFFFF'], ['½', 'Half-day', '#F5A524', '#111214'], ['S', 'Sick', '#F0703A', '#FFFFFF'], ['', 'Clear', '#F3F3F1', '#111214']];
    var BM = {}; B.forEach(function (b) { BM[b[0]] = b; });
    var people = ['Chef Dukhishyam Khuntia', 'Gift Abraham', 'Khadija Ally', 'Mr Abinash Raja', 'Mr Amal Somaiya', 'Mr Ashit Shah', 'Mr Chirag Tanna', 'Mr Daniel Opanga', 'Mr Diptobrato Bagchi', 'Mr Emmanuel Allando', 'Mr Gangadhar Mathankar', 'Mr Hriday Solanki', 'Mr Jitesh Solanki', 'Mr Juned Shaikh'];
    var WD = ['T', 'W', 'T', 'F', 'S', 'S', 'M'];
    var days = []; for (var d = 1; d <= 30; d++) days.push({ n: d, wd: WD[(d - 1) % 7], c: d === 24 ? '#111214' : ((d - 1) % 7 === 5 ? '#C4C5C9' : '#8E9197'), w: d === 24 ? '700' : '400' });
    var rows = people.map(function (name, pi) {
      var cells = []; for (var d = 1; d <= 30; d++) (function (d) {
        var k = S.marks[pi + ':' + d] || ''; var b = BM[k]; var sun = (d - 1) % 7 === 5;
        cells.push({ k: k, bg: k ? b[2] : (sun ? '#F3F3F1' : '#FAFAF8'), fg: k ? b[3] : '#111214', border: d === 24 ? '1.5px solid #111214' : '1px solid #F0F0EC', label: name + ' · ' + d + ' Sept',
          paint: function () { var m = Object.assign({}, S.marks); if (S.brush) m[pi + ':' + d] = S.brush; else delete m[pi + ':' + d]; self.setState({ marks: m }); } });
      })(d);
      return { name: name.replace(/^(Mr|Ms|Mrs|Chef) /, ''), cells: cells };
    });
    var count = function (k) { return people.filter(function (_, pi) { return S.marks[pi + ':24'] === k; }).length; };
    var marked = people.filter(function (_, pi) { return S.marks[pi + ':24']; }).length;
    return {
      rows: rows, days: days, marked: marked,
      tally: [['P', 'present'], ['A', 'absent'], ['L', 'on leave'], ['R', 'remote']].map(function (t) { return { n: count(t[0]), l: t[1], c: BM[t[0]][2] }; }),
      brushes: B.map(function (b) { var on = S.brush === b[0]; return { k: b[0] || '×', l: b[1], c: b[2], fg: b[3], on: on, bg: on ? '#F3F3F1' : '#FFFFFF', border: on ? '#111214' : '#E4E4E0', pick: function () { self.setState({ brush: b[0] }); } }; }),
      markAll: function () { var m = Object.assign({}, S.marks); people.forEach(function (_, pi) { m[pi + ':24'] = S.brush || 'P'; }); self.setState({ marks: m }); },
      isReg: S.view === 'reg', isHol: S.view === 'hol', toHol: function () { self.setState({ view: 'hol' }); },
      views: segs([['reg', 'Register'], ['hol', 'Holidays', 0]], S.view, function (k) { self.setState({ view: k }); })
    };
  }
}
'''
write('Attendance.dc.html', head('Attendance') + frame(ainner, 'Attendance', 'New task', 'Today', 'Nobody marked yet · 0 self check-ins') + tail(ascript))

# ---------- Supplies ----------
sleft = dark_card(card_title('Stock', '<span>current = opening + bought − issued</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 24px">
''' + ring(95, 120, 12, '#19C37D', '#26282C', '40', 'of 42 fine') + '''
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; flex-grow: 1; padding-bottom: 6px">
<div><div style="font-size: 30px; letter-spacing: -0.03em; line-height: 1">2</div><div style="font-size: 12px; color: #F5B94E; margin-top: 6px">to reorder</div></div>
<div><div style="font-size: 30px; letter-spacing: -0.03em; line-height: 1">0</div><div style="font-size: 12px; color: #A3A6AB; margin-top: 6px">out of stock</div></div>
<div><div style="font-size: 30px; letter-spacing: -0.03em; line-height: 1">114k</div><div style="font-size: 12px; color: #A3A6AB; margin-top: 6px">TZS in stock</div></div>
</div></div>''')
need = [('Black Marker Pen', 'blackmarker', '1 piece left', 'reorder at 5', 20), ('Notebook', 'notebook', '4 pieces left', 'reorder at 5', 80)]
sright = dark_card(card_title('Needs attention', '<span>lowest first</span>') + '<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px">' + ''.join(
    '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 140px auto; column-gap: 14px; align-items: center; padding: 10px 12px; border-radius: 12px; background: rgba(20,21,23,0.85); border: 1px solid #26282C"><span><span style="display: block; font-size: 14px">%s</span><span style="display: block; font-size: 11px; color: #8E9197; font-family: \'Geist Mono\', monospace">%s</span></span><span><span style="display: block; font-size: 12px; color: #F5B94E">%s</span><span style="display: block; height: 5px; border-radius: 3px; background: #26282C; margin-top: 5px; overflow: hidden"><span style="display: block; width: %d%%; height: 100%%; background: #F5A524"></span></span><span style="display: block; font-size: 10px; color: #8E9197; margin-top: 3px">%s</span></span><span style="height: 30px; padding: 0 10px; border-radius: 8px; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600; display: flex; align-items: center">Record purchase</span></div>' % (n, c, l, p, r) for n, c, l, r, p in need) + '</div>', texture='rings')

items = [('a4envelope', 'A4 Envelope', 'Piece', '—', 39), ('a4paper', 'A4 White Paper Sheet', 'Ream', '—', 5), ('adhesivestickers', 'Stickers Paper', 'Set', '—', 1), ('bigenvelope', 'Bigger Envelope', 'Piece', '—', 41), ('biggestenvelope', 'Biggest Envelope', 'Piece', '—', 11), ('blackmarker', 'Black Marker Pen', 'Piece', '—', 1), ('bottle', 'Bottle', 'Piece', 'Other', 3), ('bowl', 'Bowl', 'Piece', 'Other', 2), ('clipspaper', 'Paper Clips', 'Piece', '—', 4), ('coffee', 'Coffee', 'Pack', 'Other', 1), ('cupcoffee', 'Coffee Cup', 'Piece', 'Other', 11)]
scols = '160px minmax(0, 1.5fr) 120px 110px 120px 28px'
slist = '''<div style="flex-grow: 1; min-height: 0; position: relative; display: flex; flex-direction: column">
<sc-if value="{{isReg}}" hint-placeholder-val="{{ true }}">
<div style="display: grid; grid-template-columns: ''' + scols + '''; column-gap: 18px; padding: 0 20px 8px; font-size: 12px; color: #6E7177"><span>Code</span><span>Item</span><span>Category</span><span style="color: #111214; font-weight: 500">In stock</span><span>Status</span><span></span></div>
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-bottom: 76px">''' + ''.join('''<div style="flex-shrink: 0; display: grid; grid-template-columns: ''' + scols + '''; column-gap: 18px; align-items: center; background: #FFFFFF; border-radius: 12px; padding: 10px 20px">
<span style="font-family: 'Geist Mono', monospace; font-size: 12px; color: #6E7177">%s</span><span style="font-size: 14px">%s <span style="color: #8E9197; font-size: 12px">· %s</span></span><span style="font-size: 13px; color: %s">%s</span><span style="font-size: 14px; font-weight: 500">%d</span><span>%s</span><span style="color: #8E9197; display: flex">''' % (c, n, u, '#A3A6AB' if cat == '—' else '#55585E', 'Not set' if cat == '—' else cat, q, lpill('Reorder', '#F5A524') if c == 'blackmarker' else lpill('OK', '#19C37D')) + ic('down', 14) + '</span></div>' for c, n, u, cat, q in items) + '''</div></sc-if>
<sc-if value="{{isEmpty}}" hint-placeholder-val="{{ false }}"><div style="flex-grow: 1; margin-bottom: 76px; border-radius: 20px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; ''' + tex('paper-dots') + '''"><div style="background: #FFFFFF; padding: 14px 20px; border-radius: 12px; text-align: center; font-size: 14px; color: #55585E">{{emptyText}}</div></div></sc-if>
''' + bottom_bar('Search code, item or category', '<label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #55585E; white-space: nowrap"><span style="width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid #CFCFCA"></span>Show archived</label>', 620) + '''
</div>'''

sinner = header('Supplies', '', seg_dyn('views') + ghost_btn('Add item', 'plus') + ghost_btn('Record purchase', 'download') + dark_btn('Record issue', 'upload')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 220px; flex-shrink: 0">' + sleft + sright + '</div>' + slist
sscript = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { view: 'reg' }; }
  renderVals() {
    var S = this.state, self = this;
    var E = { dash: 'Spend this period: TZS 0 · 0 units bought · 0 units issued.', buy: 'No purchases logged yet. Record one when stock comes in.', out: 'Nothing issued yet. Record who took what, and for which company.' };
    return {
      isReg: S.view === 'reg', isEmpty: S.view !== 'reg', emptyText: E[S.view] || '',
      views: segs([['dash', 'Dashboard'], ['reg', 'Register', 42], ['buy', 'Purchases', 0], ['out', 'Issues', 0]], S.view, function (k) { self.setState({ view: k }); })
    };
  }
}
'''
write('Supplies.dc.html', head('Supplies') + frame(sinner, 'Supplies', 'New task', 'Running low', 'Black Marker Pen · 1 left') + tail(sscript))

# ---------- Cleaning ----------
cleft = dark_card(card_title('Thursday 24 September', '<span>{{status}}</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 26px">
<div style="position: relative; width: 128px; height: 128px; flex-shrink: 0"><svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true" style="transform: rotate(-90deg)"><circle cx="64" cy="64" r="57" fill="none" stroke="#26282C" stroke-width="13"></circle><circle cx="64" cy="64" r="57" fill="none" stroke="#19C37D" stroke-width="13" stroke-linecap="round" stroke-dasharray="{{dash}}"></circle></svg>
<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center"><div style="font-size: 30px; letter-spacing: -0.03em; line-height: 1">{{done}}/12</div><div style="font-size: 11px; color: #8E9197; margin-top: 3px">areas done</div></div></div>
<div style="display: flex; flex-direction: column; gap: 8px; padding-bottom: 6px"><div style="font-size: 12px; color: #8E9197">Who cleaned today</div><div style="height: 36px; padding: 0 12px; border-radius: 10px; background: #1F2023; border: 1px solid #2E3035; display: flex; align-items: center; gap: 10px; font-size: 13px; min-width: 220px">Not set<span style="flex-grow: 1"></span>''' + ic('down', 12) + '''</div><div style="font-size: 12px; color: #8E9197">The receptionist ticks from the portal; you can step in here.</div></div>
</div>''')
cright = dark_card(card_title('Day note', '<span>optional · saves when you click away</span>') + '''<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px"><div style="height: 70px; border-radius: 12px; background: #1F2023; border: 1px solid #2E3035; padding: 10px 12px; font-size: 13px; color: #8E9197; box-sizing: border-box">Anything worth recording about today’s cleaning…</div><div style="display: flex; align-items: center; gap: 10px; font-size: 12px; color: #8E9197"><span style="flex-grow: 1">Once signed off, ticks lock until someone presses Unlock.</span><span style="height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid #34363B; color: #E6E6E3; display: flex; align-items: center">Previous days</span></div></div>''', texture='dots')
cgrid = '''<div style="flex-grow: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 12px">
<sc-for list="{{areas}}" as="a" hint-placeholder-count="12"><div style="background: #FFFFFF; border-radius: 16px; padding: 14px 16px; display: flex; align-items: center; gap: 14px; border: 1.5px solid {{a.ring}}">
<button type="button" onClick="{{a.tick}}" aria-pressed="{{a.on}}" aria-label="Tick {{a.name}}" style="width: 40px; height: 40px; border-radius: 12px; border: 1.5px solid {{a.bb}}; background: {{a.bg}}; color: #FFFFFF; display: flex; align-items: center; justify-content: center; flex-shrink: 0">''' + ic('check', 18, 3) + '''</button>
<span style="flex-grow: 1; min-width: 0"><span style="display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{a.name}}</span><span style="display: block; font-size: 12px; color: {{a.sc}}">{{a.sub}}</span></span>
<button type="button" aria-label="Comment on {{a.name}}" style="width: 32px; height: 32px; border-radius: 9px; border: 0; background: transparent; color: #A3A6AB; display: flex; align-items: center; justify-content: center">''' + ic('chat', 15) + '''</button>
</div></sc-for></div>'''
datenav = '''<div style="display: flex; align-items: center; gap: 4px; height: 36px; padding: 0 4px; border-radius: 11px; background: #FFFFFF; border: 1px solid #DEDED9"><button type="button" aria-label="Previous day" style="width: 28px; height: 28px; border-radius: 8px; border: 0; background: transparent; display: flex; align-items: center; justify-content: center">''' + ic('left', 13, 2.2) + '''</button><span style="font-size: 13px; font-weight: 500; padding: 0 6px">Today</span><button type="button" aria-label="Next day" disabled style="width: 28px; height: 28px; border-radius: 8px; border: 0; background: transparent; color: #C4C5C9; display: flex; align-items: center; justify-content: center">''' + ic('right', 13, 2.2) + '''</button></div>'''
cinner = header('Cleaning', '', datenav + dark_btn('Sign off the day', 'check')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 220px; flex-shrink: 0">' + cleft + cright + '</div>' + cgrid
cscript = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { done: {} }; }
  renderVals() {
    var S = this.state, self = this;
    var A = ['Reception', 'Directors Office', 'Staff Working Area', 'Board Room 1', 'Board Room 2', 'Daniel, Ashit and Jitesh Office', 'Admin Office', 'Kitchen', 'Office Washroom', 'Staff Washroom', 'Bathing Area', 'Outside Area'];
    var n = Object.keys(S.done).length, C = 2 * Math.PI * 57;
    return {
      done: n, dash: (C * n / 12).toFixed(1) + ' ' + C.toFixed(1), status: n === 0 ? 'Not started' : (n === 12 ? 'Complete — sign it off' : 'In progress'),
      areas: A.map(function (a, i) { var on = !!S.done[i]; return { name: a, on: on, bg: on ? '#19C37D' : '#FFFFFF', bb: on ? '#19C37D' : '#DADAD5', ring: on ? '#CFEFDF' : '#FFFFFF', sub: on ? 'Done just now' : 'Not done yet', sc: on ? '#19A06A' : '#A3A6AB',
        tick: function () { var d = Object.assign({}, S.done); if (on) delete d[i]; else d[i] = 1; self.setState({ done: d }); } }; })
    };
  }
}
'''
write('Cleaning.dc.html', head('Cleaning') + frame(cinner, 'Cleaning', 'New task', 'Checklist', '12 areas · the receptionist logs from the portal') + tail(cscript))
