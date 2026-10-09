"""Build the offline review UI. Python standard library only; no downloads."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import zipfile
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]

class Controls(HTMLParser):
    def __init__(self):
        super().__init__(); self.controls = {}; self.select = None; self.option = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'input' and 'id' in a:
            self.controls[a['id']] = {'value': a.get('value', ''), 'checked': 'checked' in a, 'type': a.get('type', 'text')}
        elif tag == 'select':
            self.select = a.get('id')
            if self.select: self.controls[self.select] = {'value': '', 'checked': False, 'type': 'select'}
        elif tag == 'option' and self.select:
            c = self.controls[self.select]
            if not c['value'] or 'selected' in a: c['value'] = a.get('value', '')
    def handle_endtag(self, tag):
        if tag == 'select': self.select = None

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def build(portable=False):
    out = ROOT/'dist'; out.mkdir(exist_ok=True)
    for source, dest in [('data/noise_lab_v1', 'assets/noise_lab_v1'), ('reference', '.'), ('vendor', 'assets'), ('configs', '.')]:
        shutil.copytree(ROOT/source, out/dest, dirs_exist_ok=True)
    index = json.loads((ROOT/'data/noise_lab_v1/index.json').read_text(encoding='utf-8'))
    poses = json.loads((ROOT/'data/noise_lab_v1/sensor_positions_v19.json').read_text(encoding='utf-8'))
    if poses['config_sha256'] != digest(ROOT/'configs/sensor_sampling_v19.json'):
        raise ValueError('Sensor sampling config changed. Run node tools/generate-sensor-poses.cjs')
    for row in index['geometry_knobs_v3']['scenes']:
        p = poses['scenes'][row['scene']]
        if len(p['positions']) != 40 or p['geometry_id'] != row['id'] or p['geometry_sha256'] != digest(ROOT/'data/noise_lab_v1'/(row['id']+'.json')):
            raise ValueError('Stale sensor positions for '+row['scene'])
    index['sensor_positions_v19'] = poses
    for key, filename in [('parameter_distributions_v18', 'parameter_distributions_v18.json'), ('confirmed_observation_defaults_v16', 'confirmed_observation_defaults_v16.json'), ('policy', 'noise_library_policy_v6.json')]:
        index[key] = json.loads((ROOT/'configs'/filename).read_text(encoding='utf-8'))
    modules = {'model': 'core_v1', 'geometry_model': 'geometry_v3', 'geometry_random': 'random_v4', 'weather_model': 'weather_v4', 'motion_model': 'motion_v6', 'receiver_model': 'receiver_v7', 'solar_model': 'solar_v7', 'atmosphere_model': 'atmosphere_v8', 'fullrange_model': 'fullrange_v11'}
    for key, stem in modules.items(): index[key+'_sha256'] = digest(ROOT/'src'/('noise_lab_'+stem+'.js'))
    for row in index['geometry_knobs_v3']['scenes']:
        p = ROOT/'data/noise_lab_v1'/(row['id']+'.json')
        row.update(sha256=digest(p), bytes=p.stat().st_size)
    index['beam_profile_sha256'] = digest(ROOT/'data/noise_lab_v1/beam_profiles_v2.json')
    index['scan_asset_sha256'] = {p.stem: digest(p) for p in (ROOT/'data/noise_lab_v1').glob('scan_*.json')}
    packed = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    (out/'assets/noise_lab_v1/index.json').write_text(packed, encoding='utf-8')
    template = (ROOT/'src/template.html').read_text(encoding='utf-8')
    mapping = json.loads((ROOT/'src/injections.json').read_text(encoding='utf-8'))
    for _ in range(6):
        old = template
        for token, name in mapping.items():
            # Third-party code may itself contain __THREE__; do not replace recursively.
            if token != '__THREE__': template = template.replace(token, (ROOT/name).read_text(encoding='utf-8'))
        if old == template: break
    unknown = set(re.findall(r'__[A-Z][A-Z0-9_]+__', template)) - {'__THREE__', '__INDEX__', '__EMBEDDED__', '__PURE__'}
    if unknown: raise ValueError(f'Unresolved template tokens: {unknown}')
    template = template.replace('__THREE__', (ROOT/mapping['__THREE__']).read_text(encoding='utf-8')).replace('__INDEX__', packed)
    local = template.replace('__EMBEDDED__', '{}')
    for name in ['index.html', 'measured_patch_review_v1.html', 'noise_review_lab_v1.html']:
        (out/name).write_text(local, encoding='utf-8')
    parser = Controls(); parser.feed(local)
    (out/'ui-controls.json').write_text(json.dumps(parser.controls, ensure_ascii=False, indent=2), encoding='utf-8')
    preview = (ROOT/'src/asset_preview.html').read_text(encoding='utf-8').replace('__THREE__', (ROOT/'vendor/three-0.160.1.min.js').read_text(encoding='utf-8')).replace('__MODELS__', (ROOT/'data/noise_lab_v1/asset_models_v18.json').read_text(encoding='utf-8'))
    (out/'scene_asset_review_v18.html').write_text(preview, encoding='utf-8')
    shutil.copyfile(ROOT/'src/review_demo.html', out/'review_demo.html')
    shutil.copyfile(ROOT/'src/noise_lab_beam_unit_v25.js', out/'assets/beam-unit-v25.js')
    shutil.copyfile(ROOT/'src/noise_lab_scan_timing_v27.js', out/'assets/scan-timing-v27.js')
    shutil.copyfile(ROOT/'src/noise_lab_scene_v24.js', out/'assets/scene-v24.js')
    (out/'assets/prop-assets-v24.js').write_text('window.NoiseLabPropAssets='+ (ROOT/'data/noise_lab_v1/asset_models_v18.json').read_text(encoding='utf-8')+';', encoding='utf-8')
    for source, target in [('review_demo.css', 'review-demo.css'), ('review_demo_viewer.js', 'review-demo-viewer.js'), ('review_demo.js', 'review-demo.js')]:
        shutil.copyfile(ROOT/'src'/source, out/'assets'/target)
    with zipfile.ZipFile(out/'noise_lab_v1_evidence.zip', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for folder in ['src', 'configs', 'provenance', 'reference/evidence', 'vendor']:
            for p in sorted((ROOT/folder).rglob('*')):
                if p.is_file(): archive.write(p, p.relative_to(ROOT))
    if portable:
        embedded = {p.stem: json.loads(p.read_text(encoding='utf-8')) for p in (ROOT/'data/noise_lab_v1').glob('*.json') if p.stem != 'index'}
        (out/'portable.html').write_text(template.replace('__EMBEDDED__', json.dumps(embedded, ensure_ascii=False, separators=(',', ':'))), encoding='utf-8')
    manifest = {p.relative_to(ROOT).as_posix(): digest(p) for folder in ['src', 'configs', 'data', 'vendor'] for p in sorted((ROOT/folder).rglob('*')) if p.is_file()}
    (out/'build-manifest.json').write_text(json.dumps({'format': 1, 'inputs': manifest}, indent=2), encoding='utf-8')
    print(f'Built {out} | {len(index["scenes"])} scenes, {len(index["real"])} measured examples')
    return out

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--portable', action='store_true', help='Also embed simulator data in dist/portable.html; linked historical reports remain separate')
    build(parser.parse_args().portable)
