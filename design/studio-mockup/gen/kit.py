# Shared building blocks for the Studio concept boards.
import os, json
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'boards')

INK = '#111214'; CARD = '#141517'; PAGE = '#F3F3F1'; LINE = '#E4E4E0'
MUTED = '#8E9197'; SUB = '#55585E'
LATE = '#E0479E'; SOON = '#F5A524'; OK = '#19C37D'; BLUE = '#2490EF'; VIOLET = '#8B5CF6'

TEX = {
    'rings': 'repeating-radial-gradient(circle at 108% -20%, rgba(255,255,255,0.06) 0 1.5px, transparent 1.5px 12px)',
    'rings-left': 'repeating-radial-gradient(circle at -10% 120%, rgba(255,255,255,0.06) 0 1.5px, transparent 1.5px 12px)',
    'dots': 'radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1.4px)',
    'hatch': 'repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 11px)',
    'contour': 'repeating-radial-gradient(ellipse 140% 90% at 85% 115%, rgba(255,255,255,0.055) 0 1.2px, transparent 1.2px 14px)',
    'paper-dots': 'radial-gradient(#DADAD5 1px, transparent 1.3px)',
    'paper-rings': 'repeating-radial-gradient(circle at 110% 120%, rgba(17,18,20,0.05) 0 1.2px, transparent 1.2px 12px)',
}
def tex(name):
    t = TEX[name]
    size = '; background-size: 14px 14px' if 'dots' in name else ''
    return 'background-image: ' + t + size

P = 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"'
ICONS = {
    'down': '<path d="M6 9l6 6 6-6"></path>', 'up': '<path d="M18 15l-6-6-6 6"></path>',
    'left': '<path d="M15 18l-6-6 6-6"></path>', 'right': '<path d="M9 18l6-6-6-6"></path>',
    'plus': '<path d="M12 5v14M5 12h14"></path>', 'x': '<path d="M6 6l12 12M18 6L6 18"></path>',
    'check': '<path d="M5 12.5l4.5 4.5L19 7"></path>',
    'search': '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
    'filter': '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"></path><circle cx="16" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="18" cy="18" r="2"></circle>',
    'expand': '<path d="M14 4h6v6"></path><path d="M10 20H4v-6"></path><path d="M20 4l-7 7"></path><path d="M4 20l7-7"></path>',
    'collapse': '<path d="M4 14h6v6"></path><path d="M20 10h-6V4"></path><path d="M14 10l7-7"></path><path d="M3 21l7-7"></path>',
    'more': '<circle cx="5" cy="12" r="1.2"></circle><circle cx="12" cy="12" r="1.2"></circle><circle cx="19" cy="12" r="1.2"></circle>',
    'bell': '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"></path>',
    'clip': '<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"></path>',
    'mic': '<rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path>',
    'cal': '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    'repeat': '<path d="M17 2l4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path>',
    'pencil': '<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13.5 6.5l4 4"></path>',
    'trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>',
    'mail': '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path>',
    'phone': '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"></path>',
    'chat': '<path d="M4 5h16v11H9l-5 4z"></path>',
    'wa': '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"></path><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1.2-1.2 2 1-.7 1.7c-3 .3-7.5-4.2-7.2-7.2l1.7-.7 1 2z"></path>',
    'copy': '<rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16V6a2 2 0 0 1 2-2h10"></path>',
    'download': '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path>',
    'send': '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    'doc': '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4M9 13h6M9 17h6"></path>',
    'folder': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
    'star': '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"></path>',
    'pin': '<path d="M9 4h6l-1 6 3 3H7l3-3z"></path><path d="M12 13v7"></path>',
    'user': '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    'users': '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M16 14.5a5 5 0 0 1 6 5"></path>',
    'building': '<rect x="4" y="3" width="16" height="18" rx="1.5"></rect><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"></path>',
    'box': '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"></path><path d="M3 7l9 4 9-4M12 11v10"></path>',
    'spark': '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>',
    'play': '<path d="M7 5l12 7-12 7z"></path>',
    'lock': '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
    'shield': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path>',
    'gear': '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path>',
    'grid': '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
    'list': '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>',
    'clock': '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
    'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
    'upload': '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"></path>',
    'tick-box': '<rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M8 12.5l3 3 5-6"></path>',
    'brush': '<path d="M18 3l3 3-9 9-3-3z"></path><path d="M9 12l-4 1-2 5 5-2 1-4"></path>',
    'wand': '<path d="M4 20L16 8"></path><path d="M15 4v2M19 8h2M18 5l1.5-1.5M14 3.5L13 2M20.5 10l1.5 1"></path>',
    'undo': '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path>',
    'globe': '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>',
    'key': '<circle cx="8" cy="15" r="4"></circle><path d="M11 12l9-9M16 7l3 3M14 9l2 2"></path>',
    'finger': '<path d="M12 11v4a6 6 0 0 1-1 3.3"></path><path d="M8 10a4 4 0 0 1 8 0v3a10 10 0 0 1-.6 3.5"></path><path d="M5 12a7 7 0 0 1 14-2.5"></path><path d="M5.5 17a9 9 0 0 0 .5-4"></path>',
    'arrowup': '<path d="M12 19V5M5 12l7-7 7 7"></path>',
    'bolt': '<path d="M13 3L5 13h6l-1 8 8-10h-6z"></path>',
    'home': '<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path>',
    'history':'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path>',
}
def ic(name, size=14, sw=2, fill='none'):
    return '<svg width="%d" height="%d" viewBox="0 0 24 24" fill="%s" stroke="currentColor" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>' % (size, size, fill, sw, ICONS[name])

def head(title, extra_css=''):
    return '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>%s</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<style>
body{margin:0;background:#0E0F10;font-family:'Geist',system-ui,sans-serif;color:#111214}
a{color:inherit;text-decoration:none}a:hover{color:inherit}
button{font:inherit;color:inherit;cursor:pointer}
input::placeholder,textarea::placeholder{color:#8E9197}
@keyframes pop{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes rise{from{transform:scaleY(0.15);opacity:0}to{transform:none;opacity:1}}
@keyframes draw{from{stroke-dashoffset:var(--len,400)}to{stroke-dashoffset:0}}
@keyframes breathe{0%%,100%%{opacity:1}50%%{opacity:0.6}}
@media (prefers-reduced-motion: reduce){*{animation:none !important}}
%s
</style>
</helmet>
''' % (title, extra_css)

def frame(inner, page, action='New task', left_label=None, left_text=None, h=900, pad='28px 28px 24px', gap=20):
    fl = ''
    if left_label: fl += ' left-label="%s"' % left_label
    if left_text: fl += ' left-text="%s"' % left_text
    return '''<div style="width: 1440px; height: %dpx; box-sizing: border-box; background: #0E0F10; display: flex; flex-direction: column; padding: 12px 12px 0; font-family: 'Geist', system-ui, sans-serif; color: #111214">
<div style="flex-grow: 1; min-height: 0; background: #F3F3F1; border-radius: 20px; padding: %s; display: flex; flex-direction: column; gap: %dpx; box-sizing: border-box; overflow: hidden; position: relative">
%s
</div>
<dc-import name="Footer" page="%s" action="%s"%s hint-size="1416px,64px"></dc-import>
</div>
''' % (h, pad, gap, inner, page, action, fl)

def header(title, left='', right='', sub=''):
    s = '<div style="font-size: 13px; color: #8E9197; margin-top: 8px">%s</div>' % sub if sub else ''
    return '''<div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-shrink: 0">
<div style="display: flex; align-items: flex-end; gap: 16px; min-width: 0">
<div><h1 style="margin: 0; font-size: 56px; font-weight: 500; letter-spacing: -0.035em; line-height: 0.9; white-space: nowrap">%s</h1>%s</div>
<div style="display: flex; gap: 8px; align-items: center">%s</div>
</div>
<div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0">%s</div>
</div>
''' % (title, s, left, right)

def chip(label, sub='', caret=True):
    s = '<span style="color: #8E9197">%s</span>' % sub if sub else ''
    c = ic('down', 12) if caret else ''
    return '<button type="button" style="height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid #DEDED9; background: #FFFFFF; display: flex; align-items: center; gap: 8px; font-size: 13px; white-space: nowrap">%s%s%s</button>' % (label, s, c)

def dark_btn(label, icon='plus', href=None, onclick=None):
    inner = '%s%s' % (ic(icon, 15) if icon else '', label)
    st = 'height: 36px; padding: 0 16px; border-radius: 11px; background: #111214; color: #FFFFFF; border: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; white-space: nowrap'
    if href: return '<a href="%s" style="%s">%s</a>' % (href, st, inner)
    oc = ' onClick="{{%s}}"' % onclick if onclick else ''
    return '<button type="button"%s style="%s">%s</button>' % (oc, st, inner)

def ghost_btn(label, icon=None, onclick=None):
    oc = ' onClick="{{%s}}"' % onclick if onclick else ''
    return '<button type="button"%s style="height: 36px; padding: 0 14px; border-radius: 11px; background: #FFFFFF; border: 1px solid #DEDED9; display: flex; align-items: center; gap: 8px; font-size: 13px; white-space: nowrap">%s%s</button>' % (oc, ic(icon, 14) if icon else '', label)

def seg_static(items, active=0):
    out = '<div style="display: flex; gap: 2px; padding: 3px; background: #E6E6E2; border-radius: 11px">'
    for i, it in enumerate(items):
        if i == active:
            out += '<button type="button" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 0; background: #FFFFFF; font-size: 12px; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.08); white-space: nowrap">%s</button>' % it
        else:
            out += '<button type="button" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 0; background: transparent; font-size: 12px; color: #55585E; white-space: nowrap">%s</button>' % it
    return out + '</div>'

def seg_dyn(listname):
    return ('<div style="display: flex; gap: 2px; padding: 3px; background: #E6E6E2; border-radius: 11px">'
            '<sc-for list="{{%s}}" as="s" hint-placeholder-count="3"><button type="button" onClick="{{s.pick}}" aria-pressed="{{s.on}}" style="height: 30px; padding: 0 12px; border-radius: 8px; border: 0; background: {{s.bg}}; color: {{s.fg}}; box-shadow: {{s.shadow}}; font-size: 12px; font-weight: 500; white-space: nowrap; display: flex; align-items: center; gap: 6px">{{s.label}}<span style="font-size: 11px; color: #8E9197">{{s.n}}</span></button></sc-for></div>') % listname

SEG_JS = '''
function segs(defs, cur, pick) {
  return defs.map(function (d) {
    var on = d[0] === cur;
    return { label: d[1], n: d[2] == null ? '' : d[2], on: on, bg: on ? '#FFFFFF' : 'transparent', fg: on ? '#111214' : '#55585E', shadow: on ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', pick: function () { pick(d[0]); } };
  });
}
function av(ini) {
  var C = { JS: '#9FE2C2', SP: '#C9D8FF', KA: '#FFD7A1', JM: '#F8C4DE', PM: '#D9CCFF', HS: '#BFE7F2', VP: '#E7E3A6', DB: '#D3D6DA', HB: '#FBD0C0', GM: '#CDE7B0', KS: '#F6D2A8', NV: '#C8E0F4', AS: '#E4CCF2', YC: '#D5E8D4', JU: '#F2E0B8', DK: '#F8D6C8', PA: '#D0E4E8', GA: '#E8D8C0', CT: '#DCD4F0', OM: '#E0E0DA', DO: '#CFE3D8', MK: '#F0D0D8', KH: '#E6E0C8', AR: '#D8E0F0', HI: '#FBD0C0', SM: '#E0D8EE', PR: '#F3D3DF', DT: '#D6ECE4' };
  return C[ini] || '#DADAD5';
}
'''

def tail(script_body, w=1440, h=900, props=None):
    p = {'$preview': {'width': w, 'height': h}}
    if props: p.update(props)
    return '''</x-dc>
<script type="text/x-dc" data-dc-script data-props='%s'>
%s
</script>
</body>
</html>
''' % (json.dumps(p, ensure_ascii=False).replace("'", '&#39;'), SEG_JS + script_body)

def write(name, html):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(html)
    print('wrote', name, len(html))

# small render helpers used inside markup strings
def dark_card(inner, style='', texture=None):
    t = ('; ' + tex(texture)) if texture else ''
    return '<div style="background-color: #141517%s; border-radius: 20px; padding: 20px 24px; color: #F2F2F0; display: flex; flex-direction: column; box-sizing: border-box; min-width: 0; overflow: hidden; position: relative; %s">%s</div>' % (t, style, inner)

def white_card(inner, style='', texture=None):
    t = ('; ' + tex(texture)) if texture else ''
    return '<div style="background-color: #FFFFFF%s; border-radius: 20px; padding: 20px 22px; display: flex; flex-direction: column; box-sizing: border-box; min-width: 0; overflow: hidden; position: relative; %s">%s</div>' % (t, style, inner)

def card_title(label, right=''):
    return '<div style="display: flex; align-items: center; justify-content: space-between; min-height: 26px; flex-shrink: 0"><div style="font-size: 13px; color: #A3A6AB">%s</div><div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8E9197">%s</div></div>' % (label, right)

def wcard_title(label, right=''):
    return '<div style="display: flex; align-items: center; justify-content: space-between; min-height: 26px; flex-shrink: 0"><div style="font-size: 15px; font-weight: 600">%s</div><div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8E9197">%s</div></div>' % (label, right)

def big(n, unit='', size=76):
    u = '<span style="font-size: 18px; color: #8E9197">%s</span>' % unit if unit else ''
    return '<div style="display: flex; align-items: baseline; gap: 10px"><span style="font-size: %dpx; line-height: 0.85; letter-spacing: -0.045em">%s</span>%s</div>' % (size, n, u)

def pill(label, fg='#5BE0A5', bg='#1D2A23', dot='#19C37D'):
    d = '<span style="width: 7px; height: 7px; border-radius: 4px; background: %s"></span>' % dot if dot else ''
    return '<span style="display: inline-flex; align-items: center; gap: 7px; height: 24px; padding: 0 10px; border-radius: 8px; background: %s; color: %s; font-size: 12px; white-space: nowrap">%s%s</span>' % (bg, fg, d, label)

def lpill(label, dot=None, fg='#111214', bg='#F3F3F1'):
    d = '<span style="width: 7px; height: 7px; border-radius: 4px; background: %s"></span>' % dot if dot else ''
    return '<span style="display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px; border-radius: 7px; background: %s; color: %s; font-size: 12px; white-space: nowrap">%s%s</span>' % (bg, fg, d, label)

def ring(pct, size=120, stroke=12, color='#19C37D', track='#26282C', label='', sub='', fg='#F2F2F0'):
    import math
    r = (size - stroke) / 2.0
    c = 2 * math.pi * r
    on = c * pct / 100.0
    return '''<div style="position: relative; width: %dpx; height: %dpx; flex-shrink: 0">
<svg width="%d" height="%d" viewBox="0 0 %d %d" aria-hidden="true" style="transform: rotate(-90deg)"><circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="%d"></circle><circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-width="%d" stroke-linecap="round" stroke-dasharray="%.1f %.1f" style="--len: %.1f; stroke-dashoffset: 0; animation: draw 900ms cubic-bezier(.2,.8,.2,1) both"></circle></svg>
<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: %s"><div style="font-size: %dpx; letter-spacing: -0.03em; line-height: 1">%s</div><div style="font-size: 11px; color: #8E9197; margin-top: 3px">%s</div></div>
</div>''' % (size, size, size, size, size, size, size/2, size/2, r, track, stroke, size/2, size/2, r, color, stroke, on, c, on, fg, int(size*0.24), label, sub)

def arc(pct, w=300, stroke=22, color='#19C37D', track='#EAF7F0'):
    import math
    r = (w - stroke) / 2.0
    L = math.pi * r
    on = L * pct / 100.0
    cx = w / 2.0; y = r + stroke / 2.0
    d = 'M%.1f %.1f A%.1f %.1f 0 0 1 %.1f %.1f' % (stroke/2.0, y, r, r, w - stroke/2.0, y)
    return '<svg viewBox="0 0 %d %d" width="100%%" height="%d" aria-hidden="true"><path d="%s" fill="none" stroke="%s" stroke-width="%d" stroke-linecap="round"></path><path d="%s" fill="none" stroke="%s" stroke-width="%d" stroke-linecap="round" stroke-dasharray="%.1f %.1f" style="--len: %.1f; animation: draw 1s cubic-bezier(.2,.8,.2,1) both"></path></svg>' % (w, int(y + stroke/2.0), int(y + stroke/2.0), d, track, stroke, d, color, stroke, on, L, on)

def avatar(ini, size=26, border='#FFFFFF', ml='0'):
    return '<span style="width: %dpx; height: %dpx; border-radius: %dpx; background: %s; border: 2px solid %s; font-size: %dpx; font-weight: 600; color: #111214; display: inline-flex; align-items: center; justify-content: center; margin-left: %s; box-sizing: border-box; flex-shrink: 0">%s</span>' % (size, size, size//2, AVC.get(ini, '#DADAD5'), border, max(8, size//3), ml, ini)

AVC = {'JS': '#9FE2C2', 'SP': '#C9D8FF', 'KA': '#FFD7A1', 'JM': '#F8C4DE', 'PM': '#D9CCFF', 'HS': '#BFE7F2', 'VP': '#E7E3A6', 'DB': '#D3D6DA', 'HB': '#FBD0C0', 'GM': '#CDE7B0', 'KS': '#F6D2A8', 'NV': '#C8E0F4', 'AS': '#E4CCF2', 'YC': '#D5E8D4', 'JU': '#F2E0B8', 'DK': '#F8D6C8', 'PA': '#D0E4E8', 'GA': '#E8D8C0', 'CT': '#DCD4F0', 'OM': '#E0E0DA', 'DO': '#CFE3D8', 'MK': '#F0D0D8', 'PR': '#F3D3DF', 'DT': '#D6ECE4', 'KH': '#E6E0C8', 'AR': '#D8E0F0', 'SM': '#E0D8EE', 'MA': '#E2E6CF'}

def tchip(label, on=False, h=28):
    b, bg, fg = ('#111214', '#111214', '#FFFFFF') if on else ('#E4E4E0', '#FFFFFF', '#111214')
    return '<span style="height: %dpx; padding: 0 10px; border-radius: 8px; border: 1px solid %s; background: %s; color: %s; font-size: 12px; display: flex; align-items: center; white-space: nowrap">%s</span>' % (h, b, bg, fg, label)

def check(label, on=False, hint=''):
    box = '<span style="width: 16px; height: 16px; border-radius: 5px; background: #111214; color: #FFFFFF; display: flex; align-items: center; justify-content: center; flex-shrink: 0">%s</span>' % ic('check', 11, 3) if on else '<span style="width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid #CFCFCA; flex-shrink: 0"></span>'
    h = '<span style="font-size: 11px; color: #A3A6AB; margin-left: 4px">%s</span>' % hint if hint else ''
    return '<div style="display: flex; align-items: center; gap: 10px; font-size: 13px">%s%s%s</div>' % (box, label, h)

def toggle(on=False):
    return '<span style="width: 34px; height: 20px; border-radius: 10px; background: %s; position: relative; display: inline-block; flex-shrink: 0"><span style="position: absolute; top: 2px; left: %s; width: 16px; height: 16px; border-radius: 8px; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0,0,0,0.2)"></span></span>' % ('#111214' if on else '#D6D6D2', '16px' if on else '2px')

def field(label, inner, hint=''):
    h = '<span style="font-size: 11px; color: #A3A6AB">%s</span>' % hint if hint else ''
    return '<div style="display: flex; flex-direction: column; gap: 6px; min-width: 0"><span style="display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: #6E7177"><span>%s</span>%s</span>%s</div>' % (label, h, inner)

def box(v, grey=False, icon=None, h=38):
    i = '<span style="color: #8E9197; display: flex">%s</span>' % ic(icon, 14) if icon else ''
    return '<div style="height: %dpx; border-radius: 10px; border: 1px solid #E4E4E0; background: #FFFFFF; display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 13px; color: %s; min-width: 0; white-space: nowrap; overflow: hidden; box-sizing: border-box">%s%s</div>' % (h, '#8E9197' if grey else '#111214', i, v)

def sr(label):
    return '<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">%s</span>' % label

def bottom_bar(search_ph, right='', width=860):
    return '''<div style="position: absolute; left: 50%%; transform: translateX(-50%%); bottom: 4px; width: %dpx; height: 56px; background: #FFFFFF; border: 1px solid #E4E4E0; border-radius: 16px; box-shadow: 0 10px 28px rgba(17,18,20,0.12); display: flex; align-items: center; gap: 10px; padding: 0 8px 0 16px; box-sizing: border-box; z-index: 3">
<label style="display: flex; align-items: center; gap: 8px; flex-grow: 1; color: #8E9197">%s%s<input placeholder="%s" style="border: 0; outline: none; background: transparent; font: inherit; font-size: 13px; color: #111214; width: 100%%"></label>
%s
</div>''' % (width, ic('search', 15), sr('Search'), search_ph, right)

def bar_seg(listname):
    return ('<sc-for list="{{%s}}" as="s" hint-placeholder-count="4"><button type="button" onClick="{{s.pick}}" aria-pressed="{{s.on}}" style="height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid {{s.border}}; background: {{s.bg}}; color: {{s.fg}}; font-size: 12px; display: flex; align-items: center; gap: 7px; white-space: nowrap"><span style="width: 7px; height: 7px; border-radius: 4px; background: {{s.dot}}"></span>{{s.label}}<span style="font-family: \'Geist Mono\', monospace; font-size: 11px; opacity: 0.7">{{s.n}}</span></button></sc-for>') % listname

BARSEG_JS = '''
function barsegs(defs, cur, pick) {
  return defs.map(function (d) {
    var on = d[0] === cur;
    return { label: d[1], n: d[2], dot: d[3], on: on, bg: on ? '#111214' : '#FFFFFF', fg: on ? '#FFFFFF' : '#111214', border: on ? '#111214' : '#E4E4E0', pick: function () { pick(d[0]); } };
  });
}
'''
