"""Verify packaged assets, local page links, and build input hashes without network access."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import base64
import gzip
import hashlib
import json
from build import ROOT

class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('href','src') and value: self.links.append(value)

def main():
    out=ROOT/'dist'; errors=[]
    if not (out/'index.html').exists(): raise SystemExit('Run python tools/build.py first')
    manifest=json.loads((out/'build-manifest.json').read_text(encoding='utf-8'))
    for name, expected in manifest['inputs'].items():
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=expected: errors.append('Rebuild required: '+name)
    for page in out.glob('*.html'):
        if page.name=='portable.html': continue
        parser=Links(); parser.feed(page.read_text(encoding='utf-8'))
        for link in parser.links:
            u=urlsplit(link)
            if u.scheme or u.netloc or not u.path: continue
            if not (page.parent/unquote(u.path)).exists(): errors.append(f'{page.name}: missing {link}')
    a=out/'assets/noise_lab_v1'; index=json.loads((a/'index.json').read_text(encoding='utf-8'))
    for row in index['scenes']+index['real']:
        data=json.loads((a/(row['id']+'.json')).read_text(encoding='utf-8'))
        if 'xyz' in data:
            assert len(base64.b64decode(data['xyz']))==data['n']*12, row['id']
            assert len(base64.b64decode(data['labels']))==data['n'], row['id']
    for row in index['geometry_knobs_v3']['scenes']:
        p=a/(row['id']+'.json');data=json.loads(p.read_text(encoding='utf-8'))
        assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
        for key in ['vertices','faces']:
            assert len(gzip.decompress(base64.b64decode(data[key])))%12==0, row['id']
    if errors: raise SystemExit('\n'.join(errors))
    print(json.dumps({'passed':True,'build_inputs':len(manifest['inputs']),'scenes':len(index['scenes']),'measured_examples':len(index['real']),'broken_local_links':0}))

if __name__=='__main__': main()
