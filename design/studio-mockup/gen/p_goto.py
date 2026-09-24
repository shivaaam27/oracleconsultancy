from kit import *
import re, os

groups = [
    ('Work', [('Home', 'Home.dc.html', 'home', 'Your day at a glance'), ('Tasks', 'Main.dc.html', 'list', '70 open · 16 late'), ('Approvals', None, 'check', 'Waiting for your yes'), ('Recurring', 'Recurring.dc.html', 'repeat', '12 rules'), ('Notes', 'Notes.dc.html', 'doc', '16 notes'), ('Outbox', 'Outbox.dc.html', 'send', '19 to chase'), ('Chat', None, 'chat', 'Messages'), ('Calendar', 'Calendar.dc.html', 'cal', '1 thing today'), ('Director Brief', 'Brief.dc.html', 'download', 'September'), ('Announcements', 'Announcements.dc.html', 'bell', '1 live')]),
    ('Records', [('People', 'People.dc.html', 'users', '34 active'), ('Companies', 'Companies.dc.html', 'building', '14'), ('Documents', 'Documents.dc.html', 'folder', '15 expired'), ('Assets & Vendors', 'Assets.dc.html', 'box', '46 assets')]),
    ('Operations', [('Tax & Legal', None, 'shield', 'Statutory work'), ('Commitments', None, 'clock', 'Leases, insurance'), ('Applications', None, 'upload', 'Permits in progress'), ('Attendance', 'Attendance.dc.html', 'check', 'Today'), ('Supplies', 'Supplies.dc.html', 'box', '2 to reorder'), ('Cleaning', 'Cleaning.dc.html', 'tick-box', '0 of 12 today')]),
    ('System', [('Insights', 'Insights.dc.html', 'spark', 'This month'), ('Activity log', 'Activity.dc.html', 'history', '58 today'), ('ORI Automation', 'Ori.dc.html', 'bolt', '12 live'), ('Settings', 'Settings.dc.html', 'gear', '1 needs you')])]

def tile(name, href, icon, sub, current=False):
    st = 'background: #F2F2F0; color: #111214' if current else 'background: #1A1B1E; color: #F2F2F0; border: 1px solid #26282C'
    tag = 'a href="%s"' % href if href else 'span title="Same pattern — not drawn in this round"'
    end = 'a' if href else 'span'
    return '<%s style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; %s; opacity: %s"><span style="width: 30px; height: 30px; border-radius: 9px; background: %s; display: flex; align-items: center; justify-content: center; flex-shrink: 0">%s</span><span style="min-width: 0"><span style="display: block; font-size: 13px; font-weight: 500">%s</span><span style="display: block; font-size: 11px; color: %s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</span></span></%s>' % (tag, st, '1' if href else '0.55', '#E6E6E2' if current else '#26282C', ic(icon, 15), name, '#6E7177' if current else '#8E9197', sub, end)

cols = ''.join('<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0"><div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6E7177; padding: 0 4px">%s</div>%s</div>' % (g, ''.join(tile(n, h, i, s, n == 'Tasks') for n, h, i, s in items)) for g, items in groups)

panel = '''<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(14,15,16,0.35)"></div>
<div style="position: absolute; left: 0; right: 0; bottom: 20px; margin: 0 auto; width: 1080px; background: #141517; border-radius: 24px; color: #F2F2F0; padding: 20px; box-shadow: 0 30px 80px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 16px; animation: pop 220ms ease-out; ''' + tex('dots') + '''">
<div style="display: flex; align-items: center; gap: 10px">
<label style="flex-grow: 1; display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border-radius: 12px; background: #1F2023; border: 1px solid #2E3035; color: #8E9197">''' + ic('search', 16) + sr('Find a page') + '''<input placeholder="Go to a page — type a few letters" style="border: 0; outline: none; background: transparent; font: inherit; font-size: 14px; color: #F2F2F0; width: 100%"></label>
<a href="Home.dc.html" style="height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid #2E3035; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #C9CBCF">''' + ic('left', 13, 2.2) + '''Home</a>
<a href="Recurring.dc.html" style="height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid #2E3035; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #C9CBCF">Recurring''' + ic('right', 13, 2.2) + '''</a></div>
<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px">''' + cols + '''</div>
<div style="display: flex; justify-content: space-between; font-size: 12px; color: #8E9197"><span>‹ and › in the footer step through pages in this order · ⌘K still searches every record</span><span>Faded pages keep the same pattern and are drawn in the next round</span></div>
</div>'''

behind = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; ' + tex('paper-rings') + '"></div>'
write('GoTo.dc.html', head('Go to — every page') + frame(behind + panel, 'Tasks', 'New task', 'Go to', 'Every page, one tap away', pad='0') + tail('class Component extends DCLogic { renderVals() { return {}; } }'))

# Swap the older boards' hand-built footers for the shared one
P = OUT
def swap(name, page, action, ll, lt):
    f = os.path.join(P, name); s = open(f, encoding='utf-8').read()
    i = s.find('<div style="height: 64px; flex-shrink: 0; display: grid')
    if i < 0: print('no footer in', name); return
    j = s.index('</x-dc>')
    tail_ = s[i:j]
    # the footer block is followed by the closing of the root div
    k = tail_.rfind('</div>')
    new = '<dc-import name="Footer" page="%s" action="%s" left-label="%s" left-text="%s" hint-size="1416px,64px"></dc-import>\n' % (page, action, ll, lt)
    s = s[:i] + new + tail_[k:] + s[j:]
    open(f, 'w', encoding='utf-8').write(s); print('footer swapped', name)
swap('Home.dc.html', 'Home', 'New task', 'Next deadline', 'Sat 26 Sept · Bank and TRA Machine Reconciliation')
swap('Expanded.dc.html', 'Tasks', 'New task', 'You are in', 'Tasks › CC-026 · still /task/CC-026')
