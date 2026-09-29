# Decode the latest browser result files (B64: gzip JSON) into raw/chunks/*.json
import json,glob,base64,gzip,sys,os
files=sorted(glob.glob('/root/.claude/projects/-home-claude/318c2c65-1ae2-5a6e-9c5a-71ab55813ec5/tool-results/mcp-remote-devices-Claude_Browser__javascript_tool-*.txt'))
done=set(open('raw/chunks/.done').read().split()) if os.path.exists('raw/chunks/.done') else set()
n=0
for f in files:
    b=os.path.basename(f)
    if b in done: continue
    try: t=json.load(open(f))[0]['text']
    except Exception: continue
    if 'B64:' not in t: continue
    s=t[t.index('B64:')+4:]
    s=s.split('"')[0].split('\\n')[0].split('\n')[0]
    try: d=json.loads(gzip.decompress(base64.b64decode(s)))
    except Exception as e: print('bad',b,e); continue
    dest='raw/p23' if 'P23 NEXT' in t[:200] else 'raw/chunks'
    json.dump(d,open(f'{dest}/{min(d)}.json','w')); n+=1
    done.add(b); print(b,len(d),min(d),max(d))
open('raw/chunks/.done','w').write('\n'.join(sorted(done)))
print('new',n)
