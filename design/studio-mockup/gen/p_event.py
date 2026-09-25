from kit import *

def field(label, inner, hint=''):
    h = '<span style="font-size: 11px; color: #A3A6AB">%s</span>' % hint if hint else ''
    return '<div style="display: flex; flex-direction: column; gap: 6px; min-width: 0"><span style="display: flex; justify-content: space-between; font-size: 12px; color: #6E7177"><span>%s</span>%s</span>%s</div>' % (label, h, inner)

def box(v, grey=False, icon=None):
    i = '<span style="color: #8E9197; display: flex">%s</span>' % ic(icon, 14) if icon else ''
    return '<div style="height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 13px; color: %s; min-width: 0; white-space: nowrap; overflow: hidden">%s%s</div>' % ('#8E9197' if grey else '#111214', i, v)

actions = [('send', 'Send invite'), ('link', 'Meet link'), ('download', '.ics'), ('globe', 'Google'), ('copy', 'Copy link'), ('wa', 'WhatsApp'), ('eye', 'Preview email'), ('bell', 'Remind'), ('undo', 'Follow-up')]
act_html = ''.join('<button type="button" style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #2E3035; background: transparent; color: #E6E6E3; font-size: 12px; display: flex; align-items: center; gap: 6px; white-space: nowrap">%s%s</button>' % (ic(i, 13), l) for i, l in actions)

left_col = '''<div style="display: flex; flex-direction: column; gap: 16px; min-width: 0">
<label style="display: block">''' + sr('Title') + '''<input value="Pulin — TC208 DAR → JNB (PNR 1C9MSZ)" style="width: 100%; border: 0; border-bottom: 1px solid #EEEEEA; outline: none; font: inherit; font-size: 26px; font-weight: 500; letter-spacing: -0.02em; padding: 0 0 10px; background: transparent"></label>
''' + field('When', '''<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">''' + box('Mon 7 Sept 2026 · 10:45', icon='cal') + box('Ends — not on the ticket, set it', True, 'clock') + '''</div>
<div style="display: flex; align-items: center; gap: 14px; font-size: 12px; color: #55585E; margin-top: 2px"><span style="display: flex; align-items: center; gap: 6px"><span style="width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid #CFCFCA"></span>All day</span><span style="color: #8E9197">Quick: 30-min call · 1-hour meeting · Site visit · All-day</span></div>''', 'Times are Dar es Salaam (EAT)') + '''
''' + field('Guests', '''<div style="min-height: 40px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px"><span style="height: 28px; padding: 0 10px 0 4px; border-radius: 14px; background: #F3F3F1; display: flex; align-items: center; gap: 6px; font-size: 12px">''' + avatar('PM', 22, '#F3F3F1') + '''Pulin Manek<span style="width: 6px; height: 6px; border-radius: 3px; background: #19C37D" title="Has an email"></span></span><span style="font-size: 12px; color: #8E9197">Add someone from Oracle…</span></div>''', 'Green dot = will get the email') + '''
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">''' + field('Companies', box('Oracle Consultancy Ltd', icon='building')) + field('Type', box('Choose a type', True, 'folder')) + '''</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">''' + field('Where', box('Julius Nyerere International Airport', icon='globe')) + field('Meeting link', '<div style="display: flex; gap: 8px; align-items: center">' + box('No link', True, 'link') + '<span style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #55585E; white-space: nowrap"><span style="width: 30px; height: 18px; border-radius: 9px; background: #D6D6D2; position: relative"><span style="position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: #FFFFFF"></span></span>Meet</span></div>') + '''</div>
''' + field('Notes for guests', '<div style="height: 64px; border-radius: 10px; border: 1px solid #E4E4E0; padding: 10px 12px; font-size: 13px; color: #55585E; box-sizing: border-box; line-height: 1.45">Outbound leg to Johannesburg. Ticket attached — boarding pass at check-in.</div>') + '''
</div>'''

right_col = '''<div style="display: flex; flex-direction: column; gap: 14px; min-width: 0">
<div style="border-radius: 16px; background: #141517; color: #F2F2F0; padding: 16px; display: flex; flex-direction: column; gap: 10px; ''' + tex('dots') + '''">
<div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #A3A6AB">''' + ic('spark', 14) + '''Read from the ticket — check it, then save</div>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">
<div style="border-radius: 10px; background: #1F2023; padding: 10px"><div style="font-size: 11px; color: #8E9197">Flight</div><div style="font-size: 16px; margin-top: 2px">TC208</div></div>
<div style="border-radius: 10px; background: #1F2023; padding: 10px"><div style="font-size: 11px; color: #8E9197">Departs</div><div style="font-size: 16px; margin-top: 2px">10:45 EAT</div></div>
<div style="border-radius: 10px; background: #1F2023; padding: 10px"><div style="font-size: 11px; color: #8E9197">Route</div><div style="font-size: 16px; margin-top: 2px">DAR → JNB</div></div>
</div>
<div style="font-size: 12px; color: #8E9197; line-height: 1.45">Every time is read with its own time zone and shown as printed. Anything it could not read is left blank for you.</div>
</div>
''' + field('Papers that travel with it', '''<div style="display: flex; flex-direction: column; gap: 6px">
<div style="display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; column-gap: 10px; align-items: center; padding: 8px 10px; border-radius: 12px; border: 1px solid #EFEFEB"><span style="width: 34px; height: 34px; border-radius: 9px; background: #F3F3F1; display: flex; align-items: center; justify-content: center; color: #55585E">''' + ic('doc', 16) + '''</span><span style="min-width: 0"><span style="display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">E-ticket TC208 · 1C9MSZ.pdf</span><span style="display: block; font-size: 11px; color: #8E9197">Filed in Documents</span></span>
<span style="display: flex; gap: 2px; padding: 2px; background: #F3F3F1; border-radius: 8px; font-size: 11px"><span style="padding: 4px 8px; border-radius: 6px; background: #111214; color: #FFFFFF">Send to guests</span><span style="padding: 4px 8px; color: #55585E">Reference only</span></span></div>
<div style="height: 40px; border-radius: 12px; border: 1px dashed #CFCFCA; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: #55585E">''' + ic('upload', 14) + '''Drop a file · or pick one already filed</div></div>''') + '''
''' + field('Remind me', '<div style="display: flex; flex-wrap: wrap; gap: 6px">' + ''.join('<span style="height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid %s; background: %s; color: %s; font-size: 12px; display: flex; align-items: center">%s</span>' % ((('#111214', '#111214', '#FFFFFF') if on else ('#E4E4E0', '#FFFFFF', '#111214')) + (l,)) for l, on in [('At start', False), ('10 min', False), ('30 min', False), ('1 hour', True), ('1 day', True), ('2 days', False), ('1 week', False)]) + '</div>') + '''
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">''' + field('Repeats', box('Does not repeat', icon='repeat')) + field('Until', box('—', True)) + '''</div>
<div style="display: flex; flex-direction: column; gap: 8px; padding-top: 4px">
<div style="display: flex; align-items: center; gap: 10px; font-size: 13px"><span style="width: 16px; height: 16px; border-radius: 5px; background: #111214; color: #FFFFFF; display: flex; align-items: center; justify-content: center">''' + ic('check', 11, 3) + '''</span>Tell guests about this change</div>
<div style="display: flex; align-items: center; gap: 10px; font-size: 13px; color: #55585E"><span style="width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid #CFCFCA"></span>Track this meeting as a task <span style="font-size: 11px; color: #A3A6AB">(new events · one per company)</span></div>
</div>
</div>'''

dialog = '''<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; ''' + tex('paper-dots') + '''; opacity: 0.8"></div>
<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; margin: auto; width: 1120px; height: 760px; background: #FFFFFF; border-radius: 22px; box-shadow: 0 30px 80px rgba(17,18,20,0.22); display: flex; flex-direction: column; overflow: hidden; animation: pop 240ms ease-out">
<div style="background: #141517; color: #F2F2F0; padding: 14px 18px; display: flex; align-items: center; gap: 8px; flex-shrink: 0">
<a href="Calendar.dc.html" style="height: 30px; padding: 0 10px; border-radius: 8px; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 6px">''' + ic('left', 13, 2.2) + '''Calendar</a>
<span style="width: 1px; height: 20px; background: #2E3035; margin: 0 6px"></span>
<div style="display: flex; gap: 6px; flex-grow: 1; overflow: hidden">''' + act_html + '''</div>
<button type="button" style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #4A2A3C; background: transparent; color: #F07BBE; font-size: 12px">Delete…</button>
</div>
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); column-gap: 32px; padding: 22px 26px">''' + left_col + right_col + '''</div>
<div style="padding: 14px 26px; border-top: 1px solid #EEEEEA; display: flex; align-items: center; gap: 8px; flex-shrink: 0"><span style="font-size: 12px; color: #8E9197; flex-grow: 1">No clash with anything else on Mon 7 Sept.</span>
<a href="Calendar.dc.html" style="height: 38px; padding: 0 16px; border-radius: 10px; border: 1px solid #E4E4E0; font-size: 13px; display: flex; align-items: center">Cancel</a>
<a href="Calendar.dc.html" style="height: 38px; padding: 0 18px; border-radius: 10px; background: #111214; color: #FFFFFF; font-size: 13px; font-weight: 600; display: flex; align-items: center">Save changes</a></div>
</div>'''

script = 'class Component extends DCLogic { renderVals() { return {}; } }'
write('Event.dc.html', head('Calendar — event') + frame(dialog, 'Calendar', 'New event', 'Editing', 'Pulin — TC208 DAR → JNB') + tail(script))
