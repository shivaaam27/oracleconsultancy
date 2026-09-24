from kit import *

H = 1560

def icon_btn(icon, label):
    return '<button type="button" aria-label="%s" title="%s" style="width: 36px; height: 36px; border-radius: 11px; border: 1px solid #DEDED9; background: #FFFFFF; display: flex; align-items: center; justify-content: center">%s</button>' % (label, label, ic(icon, 15))

stats = [('37', '#5BE0A5', 'delivered'), ('70', '#A3A6AB', 'open'), ('16', '#F07BBE', 'overdue'), ('14', '#A3A6AB', 'companies'), ('6', '#F5B94E', 'with late work')]
stat_html = ''.join('<div><div style="font-size: 40px; letter-spacing: -0.035em; line-height: 1">%s</div><div style="font-size: 12px; color: %s; margin-top: 6px">%s</div></div>' % s for s in stats)

left = dark_card(card_title('September 2026 · as at Thu 24 Sept', '<span>This month</span>') + '''
<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 28px">
''' + ring(35, 132, 14, '#19C37D', '#26282C', '35%', 'closed') + '''
<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; flex-grow: 1; padding-bottom: 6px">''' + stat_html + '''</div>
</div>''')

acts = [('High', 'MES Ltd — all 8 open tasks are late', 'Kishan Suchak and Gangadhar Mathankar hold most of them'),
        ('High', 'Pulin Manek — 8 of 12 tasks late', 'The most late work of anyone'),
        ('Medium', '48 open tasks have no deadline', 'Nothing will ever show them as late')]
act_html = ''.join('<div style="display: grid; grid-template-columns: 64px minmax(0, 1fr); column-gap: 12px; align-items: start; padding: 10px 12px; border-radius: 12px; background: rgba(20,21,23,0.85); border: 1px solid #26282C"><span style="height: 20px; border-radius: 6px; font-size: 11px; display: flex; align-items: center; justify-content: center; background: %s; color: %s">%s</span><span><span style="display: block; font-size: 13px">%s</span><span style="display: block; font-size: 11px; color: #8E9197; margin-top: 2px">%s</span></span></div>' % ((('#3A1D2E', '#F07BBE') if u == 'High' else ('#3A2E14', '#F5B94E')) + (u, t, s)) for u, t, s in acts)
right = dark_card(card_title('Recommended director actions', '<span>worst first</span>') + '<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px">' + act_html + '</div>', texture='contour')

cos = [('MES Ltd', 7, 8, 1, 8), ('PES Ltd', 3, 11, 4, 2), ('Furaha Innovation Ltd', 6, 12, 6, 2), ('Oracle Consultancy Ltd', 5, 11, 8, 2), ('Terra Green Ltd', 1, 6, 2, 1), ('DSC Ltd', 12, 8, 4, 1), ('V1 Supermarket and Supplies', 2, 11, 6, 0), ('Dar Distributors', 0, 2, 1, 0), ('Tanam Advisory PVT. Ltd', 1, 1, 1, 0), ('Pamoja Plus', 0, 0, 0, 0), ('Akasaki Middle East LLC', 0, 0, 0, 0), ('Rugantino', 0, 0, 0, 0), ('Urban Trade Solutions', 0, 0, 0, 0), ('Venture Advisory FZCO', 0, 0, 0, 0)]
def co_tile(c):
    name, done, op, prog, late = c
    tot = max(done + op, 1)
    quiet = done + op == 0
    bar = '<div style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: #F0F0EC; margin-top: 10px"><span style="width: %.1f%%; background: #19C37D"></span><span style="width: %.1f%%; background: #2490EF"></span><span style="width: %.1f%%; background: #E0479E"></span></div>' % (done / tot * 100, max(prog, 0) / tot * 100, late / tot * 100)
    if quiet:
        return '<div style="border-radius: 14px; padding: 12px 14px; background: #FAFAF8; border: 1px dashed #E4E4E0"><div style="font-size: 13px; color: #8E9197; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</div><div style="font-size: 11px; color: #A3A6AB; margin-top: 4px">Nothing this month</div></div>' % name
    late_s = '<span style="color: #C2327F">%d late</span>' % late if late else '<span style="color: #19A06A">none late</span>'
    return '<div style="border-radius: 14px; padding: 12px 14px; background: #FFFFFF; border: 1px solid #EFEFEB"><div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</div><div style="display: flex; gap: 10px; font-size: 11px; color: #6E7177; margin-top: 4px"><span>%d done</span><span>%d open</span>%s</div>%s</div>' % (name, done, op, late_s, bar)
by_co = white_card(wcard_title('By company', '<span style="display: flex; gap: 12px"><span style="display: flex; align-items: center; gap: 5px"><span style="width: 7px; height: 7px; border-radius: 4px; background: #19C37D"></span>done</span><span style="display: flex; align-items: center; gap: 5px"><span style="width: 7px; height: 7px; border-radius: 4px; background: #2490EF"></span>in progress</span><span style="display: flex; align-items: center; gap: 5px"><span style="width: 7px; height: 7px; border-radius: 4px; background: #E0479E"></span>late</span></span>') +
    '<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; margin-top: 12px">' + ''.join(co_tile(c) for c in cos) + '</div>')

def rows(items, cols='minmax(0,1fr) auto'):
    return '<div style="display: flex; flex-direction: column; margin-top: 8px">' + ''.join('<div style="display: grid; grid-template-columns: %s; column-gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid #F2F2EE; font-size: 13px">%s</div>' % (cols, it) for it in items) + '</div>'

delivered = white_card(wcard_title('Delivered in September', '<span>37 closed</span>') + rows([
    '<span><b style="font-weight: 600">DSC Ltd</b> · 12<span style="display: block; font-size: 12px; color: #8E9197; margin-top: 2px">National housing form submission · Invoice Discounting Renewal · +10</span></span><span></span>',
    '<span><b style="font-weight: 600">MES Ltd</b> · 7</span><span></span>', '<span><b style="font-weight: 600">Furaha Innovation Ltd</b> · 6</span><span></span>',
    '<span><b style="font-weight: 600">Oracle Consultancy Ltd</b> · 5</span><span></span>', '<span><b style="font-weight: 600">PES Ltd</b> · 3</span><span></span>',
    '<span><b style="font-weight: 600">V1 Supermarket</b> · 2</span><span></span>', '<span><b style="font-weight: 600">Terra Green · Tanam Advisory</b> · 1 each</span><span></span>'],
    'minmax(0,1fr) auto') + '<div style="font-size: 12px; color: #8E9197; margin-top: 10px">Tap a company to list what it closed.</div>')

attention = white_card(wcard_title('Needs attention', '<a href="Main.dc.html" style="color: #111214">All late tasks →</a>') + rows([
    '<span><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">CC-026</span> Cocofix Payment</span>' + lpill('2d late', '#E0479E'),
    '<span><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">PE-026</span> ERP meeting</span>' + lpill('2d late', '#E0479E'),
    '<span><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">DS-041</span> Cash flow planning meeting</span>' + lpill('2d late', '#E0479E'),
    '<span><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">OC-047</span> Intercompany Billing - September</span>' + lpill('2d late', '#E0479E'),
    '<span><span style="font-family: \'Geist Mono\', monospace; font-size: 11px; color: #8E9197">CC-022</span> Plan Of Action</span>' + lpill('1d late', '#E0479E')]))

week = white_card(wcard_title('Week ahead', '<a href="Calendar.dc.html" style="color: #111214">Calendar →</a>') + rows([
    '<span>Interview with Nitesh</span><span style="font-size: 12px; color: #8E9197">Today 11:00</span>',
    '<span>TG-001 6 Months Projection Plan</span><span style="font-size: 12px; color: #8E9197">Fri 25</span>',
    '<span>VI-006 CCTV, Fridge, Storage… · CC-002 Bank and TRA…</span><span style="font-size: 12px; color: #8E9197">Sat 26</span>',
    '<span>OC-044 Jateen Money Recovery</span><span style="font-size: 12px; color: #8E9197">Mon 28</span>',
    '<span>Ms Disha Tulsidas — birthday</span><span style="font-size: 12px; color: #8E9197">Mon 28</span>']))

statutory = white_card(wcard_title('Statutory deadlines', '<a href="#" style="color: #111214">Tax &amp; Legal →</a>') + '''<div style="display: flex; align-items: center; gap: 18px; margin-top: 10px">''' + ring(0, 96, 10, '#19C37D', '#EFEFEB', '—', 'companies done', '#111214') + '''<div style="font-size: 13px; color: #55585E; line-height: 1.5">Each filing shows how many companies have done it this period, with <span style="color: #C2327F">Overdue</span> · <span style="color: #B7700A">Due now</span> · Soon badges — read live from Tax &amp; Legal.</div></div>''', texture='paper-rings')

people = white_card(wcard_title('People & HR') + '''<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 10px">
<div style="border-radius: 12px; background: #F3F3F1; padding: 12px"><div style="font-size: 24px; letter-spacing: -0.02em">34</div><div style="font-size: 11px; color: #6E7177">active staff</div></div>
<div style="border-radius: 12px; background: #F3F3F1; padding: 12px"><div style="font-size: 24px; letter-spacing: -0.02em">5</div><div style="font-size: 11px; color: #6E7177">documents due soon</div></div>
<div style="border-radius: 12px; background: #F3F3F1; padding: 12px"><div style="font-size: 24px; letter-spacing: -0.02em">0</div><div style="font-size: 11px; color: #6E7177">probations ending</div></div>
</div><div style="font-size: 12px; color: #55585E; margin-top: 10px">Joined, on leave and birthdays list here too · next birthday Ms Disha Tulsidas, Mon 28 Sept</div>''')

notes = white_card(wcard_title('Admin & HR updates', '<span style="display: flex; align-items: center; gap: 6px">Company shown<span style="width: 30px; height: 18px; border-radius: 9px; background: #111214; position: relative; display: inline-block"><span style="position: absolute; top: 2px; left: 14px; width: 14px; height: 14px; border-radius: 7px; background: #FFFFFF"></span></span></span>') + '''
<div style="display: flex; gap: 8px; margin-top: 12px"><div style="flex-grow: 1; height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; align-items: center; padding: 0 12px; font-size: 13px; color: #8E9197">Record something that isn’t a task…</div><div style="height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; align-items: center; gap: 6px; padding: 0 12px; font-size: 13px">Whole portfolio ''' + ic('down', 12) + '''</div><div style="height: 38px; padding: 0 14px; border-radius: 10px; background: #111214; color: #FFFFFF; font-size: 13px; display: flex; align-items: center">Add note</div></div>
<div style="font-size: 12px; color: #8E9197; margin-top: 10px">No updates yet. Each note can be edited in place or removed (with undo). They print in the PDF.</div>''')

inner = header('Director Brief', chip('This month', ' · September') + chip('All companies') + chip('Everyone'),
    ghost_btn('Draft to Outbox', 'mail') + icon_btn('wa', 'Share on WhatsApp') + icon_btn('mail', 'Share by email') + icon_btn('copy', 'Copy as text') + dark_btn('Download PDF', 'download')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 250px; flex-shrink: 0">' + left + right + '</div>' + by_co + \
    '<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px">' + delivered + attention + week + '</div>' + \
    '<div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr); gap: 20px">' + statutory + people + notes + '</div>'

script = 'class Component extends DCLogic { renderVals() { return {}; } }'
write('Brief.dc.html', head('Director Brief') + frame(inner, 'Director Brief', 'New task', 'Brief goes to directors', 'Weekly by email · or share it now', h=H) + tail(script, h=H))
