import sys,re,glob,os
files=sys.argv[1:] or glob.glob(os.path.join(os.path.dirname(__file__),'..','boards','*.dc.html'))
void={'input','br','img','meta','link','hr'}
for f in files:
    s=open(f,encoding='utf-8').read()
    body=s[s.index('<x-dc>')+6:s.index('</x-dc>')]
    body=re.sub(r'<helmet>[\s\S]*?</helmet>','',body)
    stack=[];bad=None
    for m in re.finditer(r'<(/?)([a-zA-Z][\w-]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*?)(/?)>',body):
        close,tag,attrs,selfc=m.groups();tag=tag.lower()
        if tag in void or selfc: continue
        if close:
            if stack and stack[-1][0]==tag: stack.pop()
            else: bad=(tag,m.start(),[t for t,_ in stack[-4:]]);break
        else: stack.append((tag,m.start()))
    name=os.path.basename(f)
    if bad: print(name,'MISMATCH close',bad[0],'at',bad[1],'open:',bad[2], body[max(0,bad[1]-150):bad[1]+20].replace('\n',' '))
    elif stack: print(name,'UNCLOSED',[(t,p) for t,p in stack[-3:]])
    else: print(name,'ok')
