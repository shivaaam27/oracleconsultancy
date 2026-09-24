from kit import *

def field(label, inner):
    return '<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 12px; color: #6E7177">%s</span>%s</div>' % (label, inner)
def chips(items, on_idx=(0,)):
    return '<div style="display: flex; flex-wrap: wrap; gap: 6px">' + ''.join(tchip(t, i in on_idx) for i, t in enumerate(items)) + '</div>'
def check(label, on=False, hint=''):
    box = '<span style="width: 16px; height: 16px; border-radius: 5px; background: #111214; color: #FFFFFF; display: flex; align-items: center; justify-content: center; flex-shrink: 0">%s</span>' % ic('check', 11, 3) if on else '<span style="width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid #CFCFCA; flex-shrink: 0"></span>'
    h = '<span style="font-size: 11px; color: #A3A6AB; margin-left: 4px">%s</span>' % hint if hint else ''
    return '<div style="display: flex; align-items: center; gap: 10px; font-size: 13px">%s%s%s</div>' % (box, label, h)

left = dark_card(card_title('Live now', '<span>Operational · since 3 Jul 2026</span>') + '''
<div style="flex-grow: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 24px; align-items: end">
<div style="min-width: 0"><div style="font-size: 22px; font-weight: 500; letter-spacing: -0.015em; line-height: 1.2">Test Announcement - Task Creation Advice</div>
<div style="font-size: 13px; color: #A3A6AB; margin-top: 8px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">When you create a task, please ensure you enable in progress or the one who is the lead to do so.</div>
<div style="display: flex; gap: 8px; margin-top: 14px"><button type="button" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600">Nudge the 27 who haven’t</button><button type="button" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid #34363B; background: transparent; color: #E6E6E3; font-size: 12px">Who has seen it</button></div></div>
<div style="display: flex; gap: 16px">''' + ring(53, 104, 11, '#F2F2F0', '#26282C', '18', 'of 34 seen') + ring(21, 104, 11, '#19C37D', '#26282C', '7', 'acknowledged') + '''</div>
</div>''')

right = dark_card(card_title('Write one with ORI', '<span>A proposal — nothing is sent until you publish</span>') + '''
<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px">
<div style="font-size: 14px; color: #C9CBCF; line-height: 1.5; max-width: 460px">Say what you want people to know. ORI drafts the title and body, in English or Swahili, for you to check.</div>
<div style="display: flex; gap: 8px; align-items: center; height: 44px; padding: 0 6px 0 14px; border-radius: 12px; background: #1F2023; border: 1px solid #2E3035"><span style="color: #8E9197; display: flex">''' + ic('spark', 15) + '''</span><span style="flex-grow: 1; font-size: 13px; color: #8E9197">e.g. “Office closed Friday for Maulid — reopen Monday 8am”</span><button type="button" onClick="{{openCompose}}" style="height: 32px; padding: 0 12px; border-radius: 9px; border: 0; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600">Draft with AI</button></div>
</div>''', texture='rings')

cols = 'minmax(0, 1.8fr) 160px 150px 150px 170px'
row = '''<div style="display: grid; grid-template-columns: ''' + cols + '''; column-gap: 20px; align-items: center; background: #FFFFFF; border-radius: 14px; padding: 14px 20px">
<div style="min-width: 0"><div style="display: flex; gap: 6px; margin-bottom: 6px">''' + lpill('Operational') + lpill('Ack required', '#F5A524') + lpill('Live', '#19C37D') + '''</div>
<div style="font-size: 15px; font-weight: 500">Test Announcement - Task Creation Advice</div>
<div style="font-size: 12px; color: #8E9197; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">When you create a task, please ensure you enable in progress or the one who is the lead to do so.</div></div>
<div style="font-size: 13px"><div>Everyone</div><div style="font-size: 11px; color: #8E9197">3 Jul 2026 · no expiry</div></div>
<div><div style="display: flex; justify-content: space-between; font-size: 12px"><span>Seen</span><span style="color: #8E9197">18 / 34</span></div><div style="height: 5px; border-radius: 3px; background: #F0F0EC; margin-top: 6px; overflow: hidden"><span style="display: block; width: 53%; height: 100%; background: #111214"></span></div></div>
<div><div style="display: flex; justify-content: space-between; font-size: 12px"><span>Acknowledged</span><span style="color: #8E9197">7 / 34</span></div><div style="height: 5px; border-radius: 3px; background: #F0F0EC; margin-top: 6px; overflow: hidden"><span style="display: block; width: 21%; height: 100%; background: #19C37D"></span></div></div>
<div style="display: flex; gap: 6px; justify-content: flex-end"><button type="button" style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 12px">Archive</button><button type="button" style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #F5C6DF; background: #FFFFFF; color: #C2327F; font-size: 12px">Delete…</button></div>
</div>'''
empty = '''<div style="flex-grow: 1; min-height: 120px; border-radius: 20px; border: 1px dashed #D6D6D2; display: flex; align-items: center; justify-content: center; ''' + tex('paper-dots') + '''"><div style="text-align: center; color: #6E7177; font-size: 13px; background: #F3F3F1; padding: 12px 18px; border-radius: 12px">No drafts or scheduled notices. Posts reach the portal, push and each person’s Announcements chat.</div></div>'''
body = '<div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px"><div style="font-size: 12px; color: #6E7177; padding: 0 20px">Noticeboard</div>' + row + empty + '</div>'

sheet = '''<sc-if value="{{composing}}" hint-placeholder-val="{{ true }}">
<div style="position: absolute; top: 16px; right: 16px; bottom: 16px; width: 520px; background: #FFFFFF; border-radius: 20px; box-shadow: 0 24px 60px rgba(17,18,20,0.25); z-index: 6; display: flex; flex-direction: column; overflow: hidden; animation: pop 200ms ease-out">
<div style="padding: 16px 20px; border-bottom: 1px solid #EEEEEA; display: flex; align-items: center; justify-content: space-between"><div style="font-size: 18px; font-weight: 600">New announcement</div>
<button type="button" onClick="{{closeCompose}}" aria-label="Close" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; display: flex; align-items: center; justify-content: center">''' + ic('x', 14, 2.2) + '''</button></div>
<div style="flex-grow: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px">
<div style="height: 40px; border-radius: 10px; border: 1px solid #111214; display: flex; align-items: center; gap: 8px; padding: 0 6px 0 12px; font-size: 13px">''' + ic('spark', 14) + '''<span style="flex-grow: 1">Office closed Friday for Maulid — reopen Monday 8am</span><span style="height: 28px; padding: 0 10px; border-radius: 8px; background: #111214; color: #FFFFFF; font-size: 12px; display: flex; align-items: center">Draft with AI</span></div>
''' + field('Title', '<div style="height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; align-items: center; padding: 0 12px; font-size: 14px; font-weight: 500">Office closed on Friday</div>') + '''
''' + field('Message', '<div style="border-radius: 10px; border: 1px solid #E4E4E0; padding: 10px 12px; font-size: 13px; line-height: 1.5; color: #333">The office will be closed on Friday for Maulid. We reopen on Monday at 8am. Urgent matters: call your manager.</div><div style="display: flex; gap: 6px; margin-top: 2px"><span style="height: 26px; padding: 0 10px; border-radius: 8px; background: #F3F3F1; font-size: 12px; display: flex; align-items: center; gap: 6px">' + ic('globe', 12) + 'Translate to Swahili</span><span style="height: 26px; padding: 0 10px; border-radius: 8px; background: #F3F3F1; font-size: 12px; display: flex; align-items: center">To English</span></div>') + '''
''' + field('Type', chips(['Operational', 'Policy', 'Holiday', 'Safety', 'Celebration', 'Urgent'], (2,))) + '''
''' + field('Who sees it', chips(['Everyone', 'A company', 'A department', 'A site', 'A job role', 'A staff type', 'Specific people', 'All managers', 'All directors'], (0,))) + '''
<div style="display: flex; flex-direction: column; gap: 8px">''' + check('Pin to the top') + check('Ask people to acknowledge it', True) + check('Urgent takeover', False, 'full-screen card when they open the portal') + '''</div>
''' + field('Also send by', '<div style="display: flex; gap: 14px">' + check('Email draft') + check('WhatsApp draft') + '</div><span style="font-size: 11px; color: #A3A6AB">Drafts go to the Outbox for you to send. Push and in-app are automatic.</span>') + '''
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">''' + field('Publish at (optional)', '<div style="height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; align-items: center; padding: 0 12px; font-size: 13px; color: #8E9197">Straight away</div>') + field('Expires (optional)', '<div style="height: 38px; border-radius: 10px; border: 1px solid #E4E4E0; display: flex; align-items: center; padding: 0 12px; font-size: 13px">Mon, after the holiday</div>') + '''</div>
</div>
<div style="padding: 14px 20px; border-top: 1px solid #EEEEEA; display: flex; gap: 8px; justify-content: flex-end"><button type="button" onClick="{{closeCompose}}" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 0; background: transparent; font-size: 13px">Cancel</button><button type="button" style="height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; font-size: 13px">Save draft</button><button type="button" onClick="{{closeCompose}}" style="height: 38px; padding: 0 18px; border-radius: 10px; border: 0; background: #111214; color: #FFFFFF; font-size: 13px; font-weight: 600">Publish</button></div>
</div></sc-if>'''

inner = header('Announcements', '', seg_dyn('tabs') + dark_btn('New announcement', onclick='openCompose')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 250px; flex-shrink: 0">' + left + right + '</div>' + body + sheet

script = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { tab: 'live', composing: true }; }
  renderVals() {
    var S = this.state, self = this;
    return {
      tabs: segs([['live', 'Live', 1], ['drafts', 'Drafts', 0], ['sched', 'Scheduled', 0], ['arch', 'Archived']], S.tab, function (k) { self.setState({ tab: k }); }),
      composing: S.composing, openCompose: function () { self.setState({ composing: true }); }, closeCompose: function () { self.setState({ composing: false }); }
    };
  }
}
'''
write('Announcements.dc.html', head('Announcements') + frame(inner, 'Announcements', 'New task', 'Live now', '1 notice · 7 of 34 have acknowledged') + tail(script))
