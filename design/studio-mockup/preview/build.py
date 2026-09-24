import json,glob,os,sys
S=os.path.dirname(os.path.abspath(__file__))
P=os.path.join(S,'..','boards')
boards={os.path.basename(f):open(f,encoding='utf-8').read() for f in glob.glob(os.path.join(P,'*.dc.html'))}
js=open(os.path.join(S,'harness.js'),encoding='utf-8').read()
html='<!doctype html><html><head><meta charset="utf-8"><div id="helmet"></div></head><body style="margin:0"><div id="root"></div><script>window.BOARDS='+json.dumps(boards).replace('</','<\/')+';window.START="Main.dc.html";</script><script>'+js+'</script></body></html>'
open(os.path.join(S,'index.html'),'w',encoding='utf-8').write(html)
print('built',len(boards))
