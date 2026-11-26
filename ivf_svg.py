import numpy as np, sys
from collections import defaultdict
rng=np.random.default_rng(int(sys.argv[2]))
SC=2; W,H=1800*SC,380*SC
hexa=lambda h:np.array([int(h[i:i+2],16) for i in(0,2,4)],float)
RAMP=[hexa(x) for x in('fff0a3','d3e78f','8fd19a','46b5a4','2290a5','1d6793','1a4675','152f55','101f3d')]
POS=[-60,20,130,250,380,520,670,820,900]
ramp=lambda d:np.array([np.interp(d,POS,[c[i] for c in RAMP]) for i in range(3)])
cw=92*SC; rh=80*SC
C=[]
for r in range(-1,7):
    for c in range(-1,W//cw+3):
        C.append(((c+.5*(r%2)+rng.uniform(-.36,.36))*cw,(r+.2+rng.uniform(-.34,.34))*rh))
C=np.array(C); C[:,0]-=70*SC; n=len(C)
Q=np.array([W/2,H*.5])
dc=np.hypot(*(C-Q).T)
probed=set(np.argsort(dc)[:4])
col=np.array([ramp(np.rint(d/SC/45)*45) for d in dc])
for i in probed: col[i]=hexa('ffe14d')
P=[];own=[]
for i in range(n):
    for p in C[i]+rng.normal(0,.27*cw,(rng.integers(9,15),2)):
        dd=np.sqrt(((C-p)**2).sum(1)); j=int(dd.argmin()); dd.sort()
        if dd[1]-dd[0]<7*SC or np.hypot(*(p-Q))<15*SC: continue
        if P and min(np.hypot(*(p-x)) for x in P[-60:])<6*SC: continue
        P.append(p);own.append(j)
P=np.array(P); dq=np.hypot(*(P-Q).T)
top=sorted((i for i in range(len(P)) if own[i] in probed),key=lambda i:dq[i])[:16]
rk=dq[top[-1]]/SC

C/=SC; P/=SC; Q/=SC; W//=SC; H//=SC
M=8
def num(v):
    s=f'{v:.1f}'
    if s.endswith('.0'): s=s[:-2]
    return '0' if s=='-0' else s
pt=lambda p:num(p[0])+','+num(p[1])
def cell(i):
    poly=[np.array(p,float) for p in((-M,-M),(W+M,-M),(W+M,H+M),(-M,H+M))]; e=[-1]*4
    for j in np.argsort(((C-C[i])**2).sum(1))[1:]:
        nv=C[j]-C[i]; off=nv@(C[i]+C[j])/2
        s=[nv@p-off for p in poly]
        if max(s)<=0: continue
        np_,ne=[],[]
        for k in range(len(poly)):
            l=(k+1)%len(poly); a,b=s[k],s[l]
            if a<=0: np_.append(poly[k]); ne.append(e[k])
            if (a<=0)!=(b<=0):
                np_.append(poly[k]+(poly[l]-poly[k])*a/(a-b)); ne.append(j if a<=0 else e[k])
        poly,e=np_,ne
        if not poly: break
    return poly,e
inside=lambda p:-3<p[0]<W+3 and -3<p[1]<H+3
hx=lambda c:'#%02x%02x%02x'%tuple(int(v) for v in np.rint(c))
fills=defaultdict(list); edges=[]
for i in range(n):
    poly,e=cell(i)
    if not poly: continue
    x=[p[0] for p in poly]; y=[p[1] for p in poly]
    if min(x)>=W or max(x)<=0 or min(y)>=H or max(y)<=0: continue
    fills[hx(col[i])].append('M'+' '.join(pt(p) for p in poly)+'z')
    for k,j in enumerate(e):
        if j>i: edges.append('M'+pt(poly[k])+' '+pt(poly[(k+1)%len(poly)]))
dots=defaultdict(list)
for i,p in enumerate(P):
    if i in top or not inside(p): continue
    dots['p' if own[i] in probed else 'l' if col[own[i]].mean()<150 else 'd'].append('M'+pt(p)+'h0')
arc=2*np.pi*rk/52
def wrap(parts,w=100):
    out=[''] 
    for s in parts:
        if len(out[-1])+len(s)>w: out.append('')
        out[-1]+=s
    return '\n'.join(out)
o=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
for c,v in fills.items(): o.append(f'<path fill="{c}" d="{wrap(v)}"/>')
o+=[f'<path fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" d="{wrap(edges)}"/>',
 '<g fill="none" stroke-linecap="round">']
for k,w,c in(('l',4.2,'#a9d3d6'),('d',4.2,'#2a6468'),('p',5.8,'#101f3d')):
    o.append(f'<path stroke="{c}" stroke-width="{w}" d="{wrap(dots[k])}"/>')
q=f'cx="{num(Q[0])}" cy="{num(Q[1])}"'
o+=[f'<circle {q} r="{rk:.2f}" stroke="#000" stroke-opacity=".27" stroke-width="1.1" stroke-linecap="butt" stroke-dasharray="{.58*arc:.4f} {.42*arc:.4f}" stroke-dashoffset="{-.21*arc:.4f}"/>',
 f'<path stroke="#e5382a" stroke-width="1.6" d="{wrap(["M"+pt(Q)+" "+pt(P[i]) for i in top])}"/>']
for i in top: o.append(f'<circle cx="{num(P[i][0])}" cy="{num(P[i][1])}" r="4.05" fill="#e5382a" stroke="#fff" stroke-width="1.1"/>')
o+=['</g>',f'<circle {q} r="9.5" fill="#fff"/>',f'<circle {q} r="7.8" fill="#e5382a"/>',f'<circle {q} r="3" fill="#fff"/>','</svg>','']
open(sys.argv[1],'w').write('\n'.join(o))
