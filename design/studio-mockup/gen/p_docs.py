from kit import *

# ---------- Documents ----------
left = dark_card(card_title('Document room', '<span>197 documents</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 28px">
''' + ring(90, 124, 13, '#19C37D', '#26282C', '177', 'valid') + '''
<div style="display: flex; flex-direction: column; gap: 10px; padding-bottom: 6px">
<button type="button" onClick="{{showExpired}}" style="border: 0; background: transparent; padding: 0; text-align: left; color: #F2F2F0"><div style="font-size: 30px; letter-spacing: -0.03em; line-height: 1">15</div><div style="font-size: 12px; color: #F07BBE; margin-top: 4px">expired</div></button>
<button type="button" onClick="{{showSoon}}" style="border: 0; background: transparent; padding: 0; text-align: left; color: #F2F2F0"><div style="font-size: 30px; letter-spacing: -0.03em; line-height: 1">5</div><div style="font-size: 12px; color: #F5B94E; margin-top: 4px">due soon</div></button>
</div>
<span style="flex-grow: 1"></span>
<div style="font-size: 12px; color: #8E9197; max-width: 200px; line-height: 1.5; padding-bottom: 6px">Expiry dates are typed by you. Oracle reminds you before each one and can open a renewal task.</div>
</div>''')

exp = [('DarSpices Interim Pass — Sanjay Kaushik', 'Staff file', 'Today', '#F5B94E'), ('MES Interim Pass — Gangadhar Mathankar', 'Staff file', 'Sat 26 Sept', '#F5B94E'), ('DarSpices Business Licence', 'DSC Ltd', 'Mon 5 Oct', '#C9CBCF'), ('V1 Plant Import Permit', 'V1 Supermarket', '335 days ago', '#F07BBE')]
right = dark_card(card_title('Expiring next', '<span>soonest first</span>') + '<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px">' + ''.join(
    '<div style="display: grid; grid-template-columns: minmax(0, 1fr) 110px auto; column-gap: 12px; align-items: center; padding: 5px 10px; border-radius: 10px; background: rgba(20,21,23,0.85); border: 1px solid #26282C"><span style="min-width: 0"><span style="display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</span><span style="display: block; font-size: 11px; color: #8E9197">%s</span></span><span style="font-size: 12px; color: %s">%s</span><span style="height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid #34363B; font-size: 11px; display: flex; align-items: center">Renew</span></div>' % (t, o, c, w) for t, o, w, c in exp) + '</div>', texture='rings')

cols = 'minmax(0, 1.6fr) 150px 150px 120px 40px'
folders = '''<div style="flex-grow: 1; min-height: 0; position: relative">
<sc-if value="{{byCo}}" hint-placeholder-val="{{ true }}">
<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 76px">
<sc-for list="{{groups}}" as="g" hint-placeholder-count="10">
<div style="background: #FFFFFF; border-radius: 14px; overflow: hidden; flex-shrink: 0">
<button type="button" onClick="{{g.toggle}}" style="width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr) 140px 120px 90px 24px; column-gap: 14px; align-items: center; border: 0; background: transparent; padding: 12px 18px; text-align: left">
<span style="width: 34px; height: 34px; border-radius: 10px; background: #F3F3F1; display: flex; align-items: center; justify-content: center; color: #55585E">''' + ic('folder', 16) + '''</span>
<span style="font-size: 15px; font-weight: 500">{{g.name}}</span>
<span style="font-size: 12px; color: #C2327F">{{g.expired}}</span><span style="font-size: 12px; color: #B7700A">{{g.soon}}</span>
<span style="font-size: 12px; color: #8E9197; text-align: right">{{g.n}}</span>
<span style="color: #8E9197; display: flex; transform: rotate({{g.rot}})">''' + ic('down', 14, 2.2) + '''</span></button>
<sc-if value="{{g.open}}" hint-placeholder-val="{{ false }}"><div style="border-top: 1px solid #F0F0EC; padding: 6px 18px 12px 66px; animation: pop 180ms ease-out">
<div style="display: grid; grid-template-columns: ''' + cols + '''; column-gap: 14px; font-size: 11px; color: #8E9197; padding: 6px 0"><span>Document</span><span>Category</span><span style="color: #111214">Expires</span><span>Status</span><span></span></div>
<sc-for list="{{g.docs}}" as="d" hint-placeholder-count="2"><div style="display: grid; grid-template-columns: ''' + cols + '''; column-gap: 14px; align-items: center; padding: 8px 0; border-top: 1px solid #F5F5F2; font-size: 13px">
<span style="min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{d.title}}</span><span style="color: #55585E">{{d.cat}}</span><span style="color: {{d.c}}">{{d.when}}</span><span>''' + '<span style="display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 6px; background: {{d.bg}}; color: {{d.fg}}; font-size: 11px">{{d.status}}</span>' + '''</span><span style="color: #8E9197; display: flex">''' + ic('more', 16) + '''</span></div></sc-for>
</div></sc-if>
</div>
</sc-for>
</div></sc-if>
<sc-if value="{{byExp}}" hint-placeholder-val="{{ false }}">
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; height: calc(100% - 76px)">
<sc-for list="{{buckets}}" as="b" hint-placeholder-count="5"><div style="background: #FFFFFF; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 8px; {{b.tex}}">
<div style="display: flex; align-items: center; gap: 8px"><span style="width: 8px; height: 8px; border-radius: 4px; background: {{b.c}}"></span><span style="font-size: 14px; font-weight: 500">{{b.label}}</span><span style="margin-left: auto; font-size: 20px; letter-spacing: -0.02em">{{b.n}}</span></div>
<sc-for list="{{b.items}}" as="d" hint-placeholder-count="2"><div style="border-radius: 10px; border: 1px solid #F0F0EC; padding: 8px 10px; font-size: 12px; background: #FFFFFF">{{d}}</div></sc-for>
</div></sc-for>
</div></sc-if>
''' + bottom_bar('Search title, type, issuer, reference, company or person', '<span style="width: 1px; height: 24px; background: #E4E4E0"></span><button type="button" style="height: 36px; padding: 0 12px; border-radius: 10px; border: 0; background: #F3F3F1; font-size: 12px; display: flex; align-items: center; gap: 6px">Saved views ' + ic('down', 12) + '</button><button type="button" style="height: 36px; padding: 0 12px; border-radius: 10px; border: 0; background: #F3F3F1; font-size: 12px; display: flex; align-items: center; gap: 6px">Select</button>', 860) + '''
</div>'''

inner = header('Documents', chip('All companies') + chip('Category') + chip('Status'), seg_dyn('views') + ghost_btn('Add several', 'upload', None).replace('<button', '<a href="AddDocs.dc.html"').replace('</button>', '</a>') + dark_btn('Add document')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 252px; flex-shrink: 0">' + left + right + '</div>' + folders

script = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { view: 'co', open: { 0: true } }; }
  renderVals() {
    var S = this.state, self = this;
    var G = [['Staff & personal files', 5, 3, 33, [['DarSpices Interim Pass — Sanjay Kaushik', 'Permit', 'Today', 'soon'], ['MES Interim Pass — Gangadhar Mathankar', 'Permit', 'Sat 26 Sept', 'soon'], ['PES Interim Pass — Abinash Raj', 'Permit', '4 Sept', 'exp']]],
      ['PES Ltd', 3, 1, 65, []], ['Furaha Innovation Ltd', 2, 0, 15, []], ['Oracle Consultancy Ltd', 2, 0, 18, []], ['DSC Ltd', 1, 1, 20, [['DarSpices Business Licence', 'Licence', 'Mon 5 Oct', 'soon']]], ['MES Ltd', 1, 0, 18, []],
      ['V1 Supermarket and Supplies Limited', 1, 0, 11, [['V1_Plant-Import-Permit', 'Licence', '335 days ago', 'exp']]], ['Terra Green Ltd', 0, 0, 13, []], ['Venture Advisory FZCO', 0, 0, 1, []], ['Unfiled', 0, 0, 3, []]];
    var ST = { exp: ['Expired', '#FDEBF4', '#A3226A', '#C2327F'], soon: ['Expiring', '#FEF3E0', '#8A5A06', '#B7700A'], ok: ['Valid', '#E4F7EE', '#0E7A4F', '#55585E'] };
    var groups = G.map(function (g, i) {
      var open = !!S.open[i];
      return { name: g[0], expired: g[1] ? g[1] + ' expired' : '', soon: g[2] ? g[2] + ' due soon' : (g[1] ? '' : 'all valid'), n: g[3] + (g[3] === 1 ? ' doc' : ' docs'), open: open, rot: open ? '180deg' : '0deg',
        docs: (g[4].length ? g[4] : [['Documents in ' + g[0], 'by category', '—', 'ok']]).map(function (d) { var s = ST[d[3]]; return { title: d[0], cat: d[1], when: d[2], status: s[0], bg: s[1], fg: s[2], c: s[3] }; }),
        toggle: function () { var o = Object.assign({}, S.open); o[i] = !open; self.setState({ open: o }); } };
    });
    var buckets = [['Expired', 15, '#E0479E', ['PES Interim Pass — Abinash Raj', 'V1 Plant Import Permit', '+ 13 more']], ['Next 7 days', 2, '#F5A524', ['DarSpices Interim Pass — Sanjay Kaushik', 'MES Interim Pass — Gangadhar Mathankar']], ['Next 30 days', 3, '#2490EF', ['DarSpices Business Licence', '+ 2 more']], ['Later or no expiry', 177, '#19C37D', ['Everything else — calm']]]
      .map(function (b, i) { return { label: b[0], n: b[1], c: b[2], items: b[3], tex: i === 3 ? 'background-image: repeating-radial-gradient(circle at 110% 120%, rgba(17,18,20,0.05) 0 1.2px, transparent 1.2px 12px)' : '' }; });
    return {
      groups: groups, buckets: buckets, byCo: S.view === 'co', byExp: S.view === 'exp',
      showExpired: function () { self.setState({ view: 'exp' }); }, showSoon: function () { self.setState({ view: 'exp' }); },
      views: segs([['co', 'By company'], ['exp', 'By expiry']], S.view, function (k) { self.setState({ view: k }); })
    };
  }
}
'''
write('Documents.dc.html', head('Documents') + frame(inner, 'Documents', 'Add document', 'Expires today', 'DarSpices Interim Pass — Sanjay Kaushik') + tail(script))

# ---------- Add several ----------
q = [('check', 'PES_Interim-Pass_Abinash-Raj.pdf', 'Saved', '#19A06A'), ('spark', 'MES-Interim-Pass-Gangadhar.pdf', 'Reading…', '#2490EF'), ('clock', 'DarSpices_Business-License.jpg', 'Waiting', '#8E9197')]
queue = white_card(wcard_title('This batch', '<span>1 saved · 0 skipped</span>') + '''<div style="margin-top: 10px; border-radius: 12px; background: #F3F3F1; padding: 10px 12px; font-size: 12px; line-height: 1.6"><div><span style="color: #6E7177">Belongs to</span> · Staff file (person chosen per document)</div><div><span style="color: #6E7177">Category</span> · Permit</div></div>
<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 12px">''' + ''.join('<div style="display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px; border: 1px solid %s; font-size: 12px"><span style="color: %s; display: flex">%s</span><span style="flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</span><span style="color: %s">%s</span></div>' % ('#111214' if s == 'Reading…' else '#F0F0EC', c, ic(i, 14), n, c, s) for i, n, s, c in q) + '''</div>
<div style="margin-top: 12px; height: 44px; border-radius: 12px; border: 1px dashed #CFCFCA; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: #55585E">''' + ic('upload', 14) + '''Drop more files</div>''', 'width: 340px; flex-shrink: 0')

preview = '''<div style="flex-grow: 1; min-width: 0; border-radius: 20px; background: #E9E9E6; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; ''' + tex('paper-dots') + '''">
<div style="width: 340px; height: 470px; background: #FFFFFF; border-radius: 6px; box-shadow: 0 20px 50px rgba(17,18,20,0.15); padding: 28px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px">
<div style="height: 12px; width: 60%; background: #E6E6E2; border-radius: 3px"></div><div style="height: 8px; width: 40%; background: #EFEFEB; border-radius: 3px"></div>
<div style="height: 90px; width: 72px; background: #F0F0EC; border-radius: 4px; margin-top: 10px"></div>
''' + ''.join('<div style="height: 7px; width: %d%%; background: #F0F0EC; border-radius: 3px"></div>' % w for w in [90, 80, 85, 60, 75, 88, 50, 70]) + '''
<div style="margin-top: auto; height: 8px; width: 45%; background: #FDEBF4; border-radius: 3px; outline: 2px solid #E0479E; outline-offset: 3px"></div>
</div>
<div style="position: absolute; left: 16px; top: 16px; height: 28px; padding: 0 10px; border-radius: 8px; background: #111214; color: #FFFFFF; font-size: 12px; display: flex; align-items: center; gap: 6px">''' + ic('spark', 13) + '''Reading page 1 of 1</div>
</div>'''

form = white_card(wcard_title('Check and save', '<span style="display: flex; align-items: center; gap: 6px; color: #19A06A">' + ic('spark', 13) + 'Filled from the scan</span>') + '''<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px; flex-grow: 1">
''' + field('Title', box('MES Interim Pass — Gangadhar Mathankar')) + '''
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">''' + field('Person', box('Gangadhar Mathankar', icon='user')) + field('Type', box('Interim pass')) + '''</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">''' + field('Issued by', box('Not found on the scan', True)) + field('Reference no.', box('Not found on the scan', True)) + '''</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">''' + field('Issue date', box('—', True, 'cal')) + field('Expiry date', '<div style="height: 38px; border-radius: 10px; border: 1.5px solid #E0479E; background: #FFF7FB; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 13px; box-sizing: border-box">' + ic('cal', 14) + 'Sat 26 Sept 2026</div>', 'from the file name') + '''</div>
''' + field('Warn me before', '<div style="display: flex; gap: 6px">' + ''.join(tchip(l, l == '30 days') for l in ['None', '14 days', '30 days', '60 days', '90 days', '180 days']) + '</div>') + '''
''' + field('Notes', box('Add a note…', True)) + '''
<div style="flex-grow: 1"></div>
<div style="font-size: 12px; color: #8E9197; line-height: 1.5">Reading only suggests. Nothing is filed, renamed or moved until you press Save.</div>
<div style="display: flex; gap: 8px"><button type="button" style="height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Skip this one</button><span style="flex-grow: 1"></span><a href="Documents.dc.html" style="height: 40px; padding: 0 18px; border-radius: 10px; background: #111214; color: #FFFFFF; font-size: 13px; font-weight: 600; display: flex; align-items: center">Save &amp; next</a></div>
</div>''', 'width: 440px; flex-shrink: 0')

top = '''<div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0"><a href="Documents.dc.html" style="height: 34px; padding: 0 12px; border-radius: 10px; background: #FFFFFF; border: 1px solid #DEDED9; font-size: 13px; display: flex; align-items: center; gap: 6px">''' + ic('left', 13, 2.2) + '''Documents</a><div style="font-size: 26px; font-weight: 500; letter-spacing: -0.02em">Add several</div>
<div style="display: flex; gap: 6px; margin-left: 16px">''' + ''.join('<span style="height: 28px; padding: 0 12px; border-radius: 14px; font-size: 12px; display: flex; align-items: center; gap: 6px; %s">%s</span>' % ('background: #111214; color: #FFFFFF' if i == 1 else ('background: #E4F7EE; color: #0E7A4F' if i == 0 else 'background: #E6E6E2; color: #55585E'), l) for i, l in enumerate(['1 · Who and what', '2 · Read and check', '3 · Done'])) + '''</div></div>'''
inner2 = top + '<div style="flex-grow: 1; min-height: 0; display: flex; gap: 16px">' + queue + preview + form + '</div>'
write('AddDocs.dc.html', head('Documents — add several') + frame(inner2, 'Documents', 'Add document', 'Batch', '3 files · 1 saved', pad='20px', gap=16) + tail('class Component extends DCLogic { renderVals() { return {}; } }'))

# ---------- Assets & Vendors ----------
aleft = dark_card(card_title('Equipment', '<span>across every company</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 28px">
<div>''' + big('46', 'assets') + '''<div style="display: flex; gap: 14px; margin-top: 12px; font-size: 12px; color: #A3A6AB"><span>442 tool units</span><span>0 low stock</span><span>0 vendors yet</span></div></div>
<span style="flex-grow: 1"></span>''' + ring(30, 116, 12, '#F2F2F0', '#26282C', '14', 'handed out') + ring(70, 116, 12, '#19C37D', '#26282C', '32', 'in store') + '''
</div>''')
aright = dark_card(card_title('Hand-over desk', '<span>Pick an asset to act on it here</span>') + '''<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: end">''' + ''.join('<div style="border-radius: 12px; background: #1A1B1E; border: 1px solid #26282C; padding: 12px"><span style="color: #C9CBCF; display: flex">%s</span><div style="font-size: 14px; margin-top: 10px">%s</div><div style="font-size: 11px; color: #8E9197; margin-top: 2px">%s</div></div>' % (ic(i, 18), t, s) for i, t, s in [('user', 'Assign to a person', 'or share with a team'), ('undo', 'Return to store', 'auto on offboarding'), ('doc', 'Handover receipt', 'a PDF to sign')]) + '</div>', texture='hatch')

acols = 'minmax(0, 1.6fr) 150px 170px 120px 90px 28px'
arows = [('Reception Area CCTV Camera', 'Oracle Consultancy Ltd'), ('Reception Area A/C', 'Oracle Consultancy Ltd'), ('Reception Area Side Table', 'Oracle Consultancy Ltd'), ('Reception Area 4x Chair', 'Oracle Consultancy Ltd'), ('Reception Area Desk Phone', 'No company set'), ('Reception Area Table', 'Oracle Consultancy Ltd'), ('Calculator Reception Area', 'Oracle Consultancy Ltd'), ('SILVERDOME RFD-142', 'FRG-01 · SN 2311FRD142144 · PES Ltd · HQ')]
alist = '''<div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column">
<div style="display: grid; grid-template-columns: ''' + acols + '''; column-gap: 18px; padding: 0 20px 8px; font-size: 12px; color: #6E7177"><span>Asset</span><span>Category</span><span>Held by</span><span>Status</span><span></span><span></span></div>
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px">''' + ''.join('''<div style="flex-shrink: 0; display: grid; grid-template-columns: ''' + acols + '''; column-gap: 18px; align-items: center; background: #FFFFFF; border-radius: 14px; padding: 12px 20px">
<span style="min-width: 0"><span style="display: block; font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</span><span style="display: block; font-size: 12px; color: #8E9197; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</span></span>
<span style="font-size: 13px; color: #A3A6AB">Not set</span><span style="font-size: 13px; color: #A3A6AB">Nobody</span><span>''' % r + lpill('In store', '#19C37D') + '''</span>
<span style="height: 30px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center; justify-content: center">Assign</span><span style="color: #8E9197; display: flex">''' + ic('more', 16) + '''</span></div>''' for r in arows) + '''</div></div>'''

ainner = header('Assets', chip('All categories') + chip('All statuses'), seg_static(['Assets 46', 'Tools 149', 'Vendors 0']) + ghost_btn('Import', 'upload') + ghost_btn('Export PDF', 'download') + dark_btn('Add asset')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 220px; flex-shrink: 0">' + aleft + aright + '</div>' + alist
write('Assets.dc.html', head('Assets, Tools & Vendors') + frame(ainner, 'Assets & Vendors', 'Add asset', 'In store', '32 assets ready to hand out') + tail('class Component extends DCLogic { renderVals() { return {}; } }'))
