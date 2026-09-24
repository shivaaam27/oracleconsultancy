# Phone + tablet kit for the Studio boards (Sept 2026).
# A board = notes column + one or two phones (393x852, iPhone 15) + a tablet
# (820x1180, iPad Air portrait). iPad LANDSCAPE (1180 wide) is >= 1024 and uses
# the desktop layout, so it is not drawn here.
from kit import ic, head, tail, write, AVC, ring

CSS = r'''
.bd{background:#E7E7E3;padding:40px;box-sizing:border-box;display:flex;gap:48px;align-items:flex-start;font-family:'Geist',system-ui,sans-serif;color:#111214}
.nt{width:290px;flex-shrink:0;font-size:13px;line-height:1.5;color:#33363B}
.nt h2{font-size:30px;font-weight:500;letter-spacing:-0.03em;margin:0 0 6px;line-height:1}
.nt h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8E9197;margin:22px 0 6px;font-weight:500}
.nt ul{margin:0;padding-left:16px}.nt li{margin:0 0 6px}
.nt .tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:6px;background:#111214;color:#fff;margin-bottom:12px}
.dv{display:flex;flex-direction:column;align-items:center;gap:14px;flex-shrink:0}
.dl{font-size:12px;color:#6E7177}
.ph{width:393px;height:852px;border-radius:54px;background:#0E0F10;position:relative;overflow:hidden;box-shadow:0 0 0 11px #1C1D20,0 0 0 12px #3A3C40,0 40px 90px rgba(0,0,0,.35)}
.tb{width:820px;height:1180px;border-radius:38px;background:#0E0F10;position:relative;overflow:hidden;box-shadow:0 0 0 14px #1C1D20,0 0 0 15px #3A3C40,0 40px 90px rgba(0,0,0,.3)}
.isl{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:124px;height:36px;border-radius:18px;background:#000;z-index:9}
.sb{height:50px;display:flex;justify-content:space-between;align-items:center;padding:0 34px 0 44px;color:#F2F2F0;font-size:15px;font-weight:600}
.sbt{height:30px;display:flex;justify-content:space-between;align-items:center;padding:0 26px;color:#F2F2F0;font-size:12px;font-weight:600}
.scr{position:absolute;top:50px;left:6px;right:6px;bottom:98px;background:#F3F3F1;border-radius:24px;overflow:hidden}
.scr.full{bottom:34px}
.scrt{position:absolute;top:30px;left:10px;right:10px;bottom:84px;background:#F3F3F1;border-radius:22px;overflow:hidden}
.hi{position:absolute;bottom:9px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:#F2F2F0;opacity:.9}
.hit{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:200px;height:5px;border-radius:3px;background:#F2F2F0;opacity:.9}
.ft{position:absolute;left:0;right:0;bottom:34px;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;color:#F2F2F0;font-size:13px}
.ftt{position:absolute;left:0;right:0;bottom:20px;height:64px;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;padding:0 20px;color:#F2F2F0;font-size:13px}
.fi{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#A3A6AB;position:relative}
.fb{width:40px;height:40px;border-radius:12px;border:1px solid #2A2C30;display:flex;align-items:center;justify-content:center;color:#C9CBCF;position:relative;box-sizing:border-box}
.bdg{position:absolute;top:-4px;right:-5px;min-width:18px;height:18px;border-radius:9px;background:#E0479E;color:#fff;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box}
.pl{display:flex;align-items:center;gap:2px;border:1px solid #2A2C30;background:#1C1D20;border-radius:13px;padding:3px}
.pla{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#A3A6AB}
.pln{height:32px;min-width:108px;padding:0 12px;border-radius:10px;background:#2A2C30;color:#fff;font-weight:500;display:flex;align-items:center;justify-content:center;gap:7px}
.new{height:40px;min-width:40px;border-radius:12px;background:#F2F2F0;color:#111214;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;box-sizing:border-box}
.pg{padding:14px 16px 0;display:flex;flex-direction:column;gap:12px}
.pgt{padding:22px 22px 0;display:flex;flex-direction:column;gap:16px}
.h1{margin:0;font-size:34px;font-weight:500;letter-spacing:-0.035em;line-height:.95}
.h1t{margin:0;font-size:48px;font-weight:500;letter-spacing:-0.035em;line-height:.95}
.hd{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.ib{width:40px;height:40px;border-radius:12px;border:1px solid #DEDED9;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box}
.ibd{width:40px;height:40px;border-radius:12px;background:#111214;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cr{display:flex;gap:8px;overflow:hidden;white-space:nowrap;margin:0 -16px;padding:0 16px;mask-image:linear-gradient(90deg,#000 88%,transparent)}
.ch{height:34px;padding:0 12px;border-radius:10px;border:1px solid #DEDED9;background:#fff;display:inline-flex;align-items:center;gap:7px;font-size:13px;white-space:nowrap;flex-shrink:0;box-sizing:border-box}
.cho{background:#111214;color:#fff;border-color:#111214}
.sg{display:flex;gap:2px;padding:3px;background:#E6E6E2;border-radius:12px}
.sgi{height:32px;flex:1;padding:0 10px;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:#55585E;white-space:nowrap}
.sgo{background:#fff;color:#111214;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.sgi .n{font-size:11px;color:#8E9197}
.dk{background:#141517;border-radius:20px;padding:16px 18px;color:#F2F2F0;position:relative;overflow:hidden;box-sizing:border-box}
.wc{background:#fff;border-radius:20px;padding:14px 16px;box-sizing:border-box;position:relative}
.ct{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#A3A6AB;min-height:22px}
.wct{display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;min-height:24px}
.wct span{font-size:12px;font-weight:400;color:#8E9197}
.dots{display:flex;gap:5px;align-items:center}.dots i{width:6px;height:6px;border-radius:3px;background:#3A3C40;display:block}.dots i.on{width:16px;background:#F2F2F0}
.dotsl i{background:#D6D6D2}.dotsl i.on{background:#111214}
.big{font-size:64px;line-height:.85;letter-spacing:-0.045em}
.bigs{font-size:48px;line-height:.85;letter-spacing:-0.045em}
.u{font-size:15px;color:#8E9197;margin-left:6px;letter-spacing:0}
.rw{display:grid;grid-template-columns:8px minmax(0,1fr) auto;column-gap:12px;align-items:center;padding:12px 2px;border-bottom:1px solid #F0F0EC}
.rw:last-child{border-bottom:0}
.d{width:8px;height:8px;border-radius:4px;display:block}
.t1{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px}
.t2{font-size:12px;color:#8E9197;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.mo{font-family:'Geist Mono',monospace;font-size:11px;color:#8E9197}
.rt{font-size:12px;text-align:right;white-space:nowrap}
.av{border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:600;color:#111214;flex-shrink:0;box-sizing:border-box;border:2px solid #fff}
.lp{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:8px;background:#F3F3F1;font-size:12px;white-space:nowrap}
.dp{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:8px;background:#1F2023;color:#F2F2F0;font-size:12px;white-space:nowrap}
.sbar{position:absolute;left:10px;right:10px;bottom:10px;background:#fff;border:1px solid #E4E4E0;border-radius:18px;box-shadow:0 10px 28px rgba(17,18,20,.14);padding:8px;display:flex;flex-direction:column;gap:8px;z-index:3}
.sin{height:40px;border-radius:12px;background:#F3F3F1;display:flex;align-items:center;gap:8px;padding:0 12px;color:#8E9197;font-size:14px}
.fade{position:absolute;left:0;right:0;bottom:0;height:130px;background:linear-gradient(180deg,rgba(243,243,241,0),#F3F3F1 60%);z-index:2}
.btn{height:44px;border-radius:12px;border:1px solid #DEDED9;background:#fff;display:flex;align-items:center;justify-content:center;gap:7px;font-size:14px;padding:0 14px;box-sizing:border-box;white-space:nowrap}
.btnd{height:44px;border-radius:12px;background:#111214;color:#fff;display:flex;align-items:center;justify-content:center;gap:7px;font-size:14px;font-weight:600;padding:0 16px;box-sizing:border-box;white-space:nowrap}
.btnw{height:40px;border-radius:11px;background:#F2F2F0;color:#111214;display:flex;align-items:center;justify-content:center;gap:7px;font-size:13px;font-weight:600;padding:0 14px;white-space:nowrap}
.btng{height:40px;border-radius:11px;border:1px solid #34363B;color:#F2F2F0;display:flex;align-items:center;justify-content:center;gap:7px;font-size:13px;padding:0 14px;white-space:nowrap;box-sizing:border-box}
.back{display:flex;align-items:center;gap:4px;font-size:14px;color:#55585E}
.tabs{display:flex;gap:18px;border-bottom:1px solid #E4E4E0;font-size:14px;color:#8E9197;white-space:nowrap;overflow:hidden}
.tabs span{padding:0 0 10px}.tabs .on{color:#111214;font-weight:500;box-shadow:inset 0 -2px 0 #111214}
.sh{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:26px 26px 0 0;box-shadow:0 -20px 60px rgba(0,0,0,.25);z-index:6}
.grab{width:40px;height:5px;border-radius:3px;background:#D6D6D2;margin:8px auto 0}
.scrim{position:absolute;inset:0;background:rgba(14,15,16,.4);z-index:5}
.fl{display:flex;flex-direction:column;gap:6px}
.fll{font-size:12px;color:#6E7177}
.fbx{min-height:44px;border-radius:12px;border:1px solid #E4E4E0;background:#fff;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:14px;box-sizing:border-box}
.tile{background:#F3F3F1;border-radius:14px;padding:10px 12px;flex:1;min-width:0}
.tile b{display:block;font-size:22px;font-weight:400;letter-spacing:-0.02em}
.tile span{font-size:11px;color:#6E7177}
.dtile{background:#1F2023;border-radius:14px;padding:10px 12px;flex:1;min-width:0}
.dtile b{display:block;font-size:22px;font-weight:400;letter-spacing:-0.02em}
.dtile span{font-size:11px;color:#A3A6AB}
.bub{max-width:78%;padding:9px 12px;border-radius:16px;font-size:14px;line-height:1.4}
.hatch{background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.045) 0 1px,transparent 1px 11px)}
.rings{background-image:repeating-radial-gradient(circle at 108% -20%,rgba(255,255,255,.06) 0 1.5px,transparent 1.5px 12px)}
.contour{background-image:repeating-radial-gradient(ellipse 140% 90% at 85% 115%,rgba(255,255,255,.055) 0 1.2px,transparent 1.2px 14px)}
.pdots{background-image:radial-gradient(#DADAD5 1px,transparent 1.3px);background-size:14px 14px}
'''

LATE, SOON, OK, NONE, BLUE, VIOLET = '#E0479E', '#F5A524', '#19C37D', '#CFCFCA', '#2490EF', '#8B5CF6'
TXT = {'late': '#C2327F', 'soon': '#B7700A', 'ok': '#111214', 'none': '#8E9197'}
DOT = {'late': LATE, 'soon': SOON, 'ok': OK, 'none': NONE}


def av(ini, size=32, border='#fff'):
    return '<span class="av" style="width:%dpx;height:%dpx;background:%s;font-size:%dpx;border-color:%s">%s</span>' % (size, size, AVC.get(ini, '#DADAD5'), max(9, size // 3), border, ini)


def faces(inis, size=24):
    out = ''
    for i, x in enumerate(inis):
        out += '<span style="margin-left:%dpx;display:inline-flex">%s</span>' % (0 if i == 0 else -7, av(x, size))
    return '<span style="display:inline-flex">%s</span>' % out


def dots(n, on=0, light=False):
    return '<span class="dots%s">%s</span>' % (' dotsl' if light else '', ''.join('<i class="on"></i>' if i == on else '<i></i>' for i in range(n)))


def seg(items, on=0):
    out = ''
    for i, it in enumerate(items):
        lab, n = (it if isinstance(it, tuple) else (it, None))
        nn = '<span class="n">%s</span>' % n if n is not None else ''
        out += '<span class="sgi%s">%s%s</span>' % (' sgo' if i == on else '', lab, nn)
    return '<div class="sg">%s</div>' % out


def chips(items):
    out = ''
    for it in items:
        on = it.startswith('*')
        lab = it.lstrip('*')
        car = '' if on or lab.endswith('!') else ic('down', 12)
        out += '<span class="ch%s">%s%s</span>' % (' cho' if on else '', lab.rstrip('!'), car)
    return '<div class="cr">%s</div>' % out


def row(tone, title, sub, right, unread=False, extra=''):
    u = '<span style="width:7px;height:7px;border-radius:4px;background:%s;flex-shrink:0"></span>' % BLUE if unread else ''
    return ('<div class="rw"><span class="d" style="background:%s"></span><div style="min-width:0"><div class="t1">%s<span style="overflow:hidden;text-overflow:ellipsis">%s</span></div><div class="t2">%s</div></div>'
            '<div class="rt" style="color:%s">%s%s</div></div>') % (DOT[tone], u, title, sub, TXT[tone], right, extra)


def notes(title, tag, phone, tablet, keep=None):
    k = ''.join('<li>%s</li>' % x for x in keep) if keep else ''
    return ('<div class="nt"><span class="tag">%s</span><h2>%s</h2><h3>On a phone</h3><ul>%s</ul><h3>On a tablet (iPad, portrait)</h3><ul>%s</ul>%s</div>' %
            (tag, title, ''.join('<li>%s</li>' % x for x in phone), ''.join('<li>%s</li>' % x for x in tablet),
             ('<h3>Stays exactly as it is</h3><ul>%s</ul>' % k) if k else ''))


def phone_footer(page, badge='9+', new=True):
    n = '<span class="new">%s</span>' % ic('plus', 16, 2.4) if new else '<span style="width:40px"></span>'
    return ('<div class="ft"><span class="fi">%s</span>'
            '<span class="pl"><span class="pla">%s</span><span class="pln">%s%s</span><span class="pla">%s</span></span>'
            '<span style="display:flex;gap:8px"><span class="fb">%s<span class="bdg">%s</span></span>%s</span></div>') % (
        ic('home', 17), ic('left', 14), page, ic('up', 11), ic('right', 14), ic('bell', 16), badge, n)


def phone(inner, page='Tasks', label='', footer=True, overlay='', badge='9+'):
    f = phone_footer(page, badge) if footer else ''
    return ('<div class="dv"><div class="ph"><div class="isl"></div><div class="sb"><span>9:41</span><span style="display:flex;gap:6px;align-items:center">'
            '<span style="font-size:12px">5G</span><span style="width:24px;height:12px;border:1.5px solid #F2F2F0;border-radius:4px;display:inline-block;position:relative"><span style="position:absolute;left:1px;top:1px;bottom:1px;width:15px;background:#F2F2F0;border-radius:2px"></span></span></span></div>'
            '<div class="scr%s">%s%s</div>%s<div class="hi"></div></div><div class="dl">%s</div></div>') % (
        '' if footer else ' full', inner, overlay, f, label or 'Phone · 393 × 852')


def tablet_footer(page, need=('#E0479E', 'Needs you', '16 tasks are late')):
    return ('<div class="ftt"><div style="min-width:0"><div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#8E9197"><span style="width:6px;height:6px;border-radius:3px;background:%s"></span>%s<span style="color:#6E7177">1/5</span></div>'
            '<div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">%s</div></div>'
            '<div style="display:flex;align-items:center;gap:10px"><span class="fi">%s</span><span class="pl"><span class="pla">%s</span><span class="pln">%s%s</span><span class="pla">%s</span></span><span class="fi">%s</span></div>'
            '<div style="display:flex;justify-content:flex-end;gap:8px"><span class="fb">%s</span><span class="fb">%s<span class="bdg">9+</span></span><span class="new">%sNew task</span></div></div>') % (
        need[0], need[1], need[2], ic('home', 17), ic('left', 14), page, ic('up', 11), ic('right', 14), ic('user', 17),
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"></path></svg>',
        ic('bell', 16), ic('plus', 15, 2.4))


def tablet(inner, page='Tasks', label='', overlay=''):
    return ('<div class="dv"><div class="tb"><div class="sbt"><span>9:41  Fri 25 Sept</span><span>100%%</span></div>'
            '<div class="scrt">%s%s</div>%s<div class="hit"></div></div><div class="dl">%s</div></div>') % (
        inner, overlay, tablet_footer(page), label or 'Tablet · iPad Air portrait · 820 × 1180')


def board(name, title, parts, h=1260):
    def pw(p):
        if 'class="ph"' in p: return 393
        if 'class="tb"' in p: return 820
        return 520 if 'width:520px' in p else 290
    w = 80 + sum(pw(p) for p in parts) + 48 * (len(parts) - 1)
    html = '<div class="bd" style="width:%dpx;height:%dpx">%s</div>' % (w, h, ''.join(parts))
    write(name, head(title, CSS) + html + tail('class Component extends DCLogic { renderVals() { return {}; } }', w=w, h=h))
    return (name, w, h, title)


def bars(vals, colors, h=56, w=4, gap=2):
    out = ''
    for v, c in zip(vals, colors):
        out += '<span style="width:%dpx;height:%dpx;border-radius:2px;background:%s;display:block"></span>' % (w, max(4, int(v * h)), c)
    return '<div style="display:flex;align-items:flex-end;gap:%dpx;height:%dpx">%s</div>' % (gap, h, out)
