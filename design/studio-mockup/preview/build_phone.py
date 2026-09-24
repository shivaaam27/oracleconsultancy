# Builds ONE self-contained page of the phone & tablet boards (M_*.dc.html) for
# publishing as a private link. python preview/build_phone.py <out.html>
import glob, json, os, sys
S = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(S, '..', 'boards')
ORDER = ['M_Rules', 'M_Home', 'M_Tasks', 'M_Task', 'M_NewTask', 'M_Calendar', 'M_Announcements', 'M_Outbox',
         'M_Companies', 'M_Company', 'M_People', 'M_Person', 'M_Files', 'M_Chat']
LABEL = {'M_Rules': 'The rules', 'M_Home': 'Home', 'M_Tasks': 'Tasks', 'M_Task': 'A task', 'M_NewTask': 'New task', 'M_Calendar': 'Calendar',
         'M_Announcements': 'Announcements', 'M_Outbox': 'Outbox', 'M_Companies': 'Companies', 'M_Company': 'A company',
         'M_People': 'People', 'M_Person': 'A person', 'M_Files': 'Files', 'M_Chat': 'Chat'}
boards = {n + '.dc.html': open(os.path.join(P, n + '.dc.html'), encoding='utf-8').read() for n in ORDER}
harness = open(os.path.join(S, 'harness.js'), encoding='utf-8').read()
# The published frame: no localStorage zoom, and the board is fitted by the page below.
harness = harness.replace("try { const v = JSON.parse(localStorage.getItem('V') || '[0,0,0]'); window.V(v[0], v[1], v[2]); } catch (e) {}", "window.fit && window.fit();")
harness = harness.replace("localStorage.setItem('V', JSON.stringify([z, x || 0, y || 0]));", "")
harness = harness.replace("document.documentElement.style.overflow = 'hidden';", "")
harness = harness.replace("load(decodeURIComponent(location.hash.slice(1)) || window.START);", "load((location.hash.slice(1) && window.BOARDS[location.hash.slice(1) + '.dc.html'] ? location.hash.slice(1) + '.dc.html' : window.START));")
harness = harness.replace("window.addEventListener('hashchange', () => load(decodeURIComponent(location.hash.slice(1))));",
                          "window.addEventListener('hashchange', () => { const h = location.hash.slice(1) + '.dc.html'; if (window.BOARDS[h]) load(h); });")
nav = ''.join('<a href="#%s" data-b="%s">%s</a>' % (n, n, LABEL[n]) for n in ORDER)
html = '''<title>Studio Phone Boards</title>
<style>
:root{--ground:#0E0F10;--bar:#141517;--line:#2A2C30;--ink:#F2F2F0;--muted:#8E9197;--on:#F2F2F0;--onink:#111214;color-scheme:dark}
html,body{background:var(--ground)}
.top{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:var(--bar);border-bottom:1px solid var(--line);padding-block:10px;padding-inline:16px;display:flex;flex-direction:column;gap:10px;font-family:'Geist',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink)}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ttl{font-size:15px;font-weight:600;letter-spacing:-0.01em}.ttl span{color:var(--muted);font-weight:400;margin-left:8px;font-size:12px}
.zm{display:flex;gap:2px;background:#1F2023;border-radius:10px;padding:3px}
.zm button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:12px;height:28px;padding:0 10px;border-radius:8px;cursor:pointer}
.zm button[aria-pressed="true"]{background:var(--on);color:var(--onink);font-weight:500}
.zm button:focus-visible,.nav a:focus-visible{outline:2px solid #2490EF;outline-offset:2px}
.nav{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.nav::-webkit-scrollbar{display:none}
.nav a{flex-shrink:0;height:30px;padding:0 11px;border-radius:9px;border:1px solid var(--line);color:#C9CBCF;text-decoration:none;display:flex;align-items:center;font-size:12px;white-space:nowrap}
.nav a[aria-current="page"]{background:var(--on);color:var(--onink);border-color:var(--on);font-weight:500}
#wrap{overflow:hidden;padding-inline:0}
#wrap.actual{overflow-x:auto}
#root{transform-origin:0 0}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<div class="top"><div class="row"><div class="ttl">COS on a phone &amp; iPad<span>directors · 14 boards</span></div>
<div class="zm" role="group" aria-label="Size"><button type="button" id="fitB" aria-pressed="true">Fit</button><button type="button" id="actB" aria-pressed="false">Actual size</button></div></div>
<nav class="nav" aria-label="Boards">''' + nav + '''</nav></div>
<div id="helmet"></div>
<div id="wrap"><div id="root"></div></div>
<script>window.BOARDS=''' + json.dumps(boards).replace('</', '<\\/') + ''';window.START="M_Rules.dc.html";
var mode='fit';
window.fit=function(){var r=document.getElementById('root'),w=document.getElementById('wrap'),b=r.firstElementChild;if(!b)return;
 if(mode==='fit'){var z=w.clientWidth/b.offsetWidth;r.style.transform='scale('+z+')';w.style.height=(b.offsetHeight*z)+'px';w.className='';}
 else{r.style.transform='none';w.style.height='auto';w.className='actual';}
 var cur=(document.title||'').replace('.dc.html','');document.querySelectorAll('.nav a').forEach(function(a){if(a.dataset.b===cur){a.setAttribute('aria-current','page');a.scrollIntoView({block:'nearest',inline:'nearest'});}else a.removeAttribute('aria-current');});};
addEventListener('resize',function(){window.fit()});
document.getElementById('fitB').onclick=function(){mode='fit';this.setAttribute('aria-pressed','true');document.getElementById('actB').setAttribute('aria-pressed','false');window.fit();};
document.getElementById('actB').onclick=function(){mode='actual';this.setAttribute('aria-pressed','true');document.getElementById('fitB').setAttribute('aria-pressed','false');window.fit();};
</script>
<script>''' + harness + '''</script>
<script>window.fit();setTimeout(window.fit,400);</script>
'''
open(sys.argv[1], 'w', encoding='utf-8').write(html)
print('ok', len(html))
