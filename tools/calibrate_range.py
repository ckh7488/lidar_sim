"""Fit radial noise from reviewed, static, surveyed plane patches. Does not approve training."""
import argparse
import json
import math
import statistics
from pathlib import Path

BINS = [(0, 5), (5, 10), (10, 20), (20, 40), (40, math.inf)]

def fit(data):
    if data.get('sensor_state') != 'normal' or data.get('mount_motion') != 'stationary':
        raise ValueError('Normal sensor and stationary mount are required; malfunction/36RPM data is unsuitable')
    if not data.get('metadata_sha256') or not data.get('source_sha256'):
        raise ValueError('Record source and sensor metadata hashes')
    rows = [[] for _ in BINS]
    for patch in data['patches']:
        if patch.get('reviewed') is not True or patch.get('area_m2', 0) < 4 or len(patch['points']) < 500:
            raise ValueError('Each reviewed plane patch needs >=4m2 and >=500 points')
        if patch.get('surface_roughness_bound_m', 1) > .005:
            raise ValueError('Survey a flat target; ground roughness must not become sensor noise')
        normal = patch['plane'][:3]
        scale = math.sqrt(sum(x*x for x in normal))
        if not scale > 0:
            raise ValueError('Invalid plane')
        normal = [x/scale for x in normal]
        offset = patch['plane'][3]/scale
        for point in patch['points']:
            origin, direction, measured = point['origin'], point['direction'], point['range_m']
            if abs(sum(x*x for x in direction)-1) > 1e-4:
                raise ValueError('Directions must be unit vectors in the surveyed plane coordinate frame')
            cosine = sum(n*d for n,d in zip(normal,direction))
            if abs(cosine) < .5:
                continue  # Grazing rays amplify plane/angle errors too strongly.
            expected = -(sum(n*o for n,o in zip(normal,origin))+offset)/cosine
            if expected <= 0 or not math.isfinite(measured):
                continue
            for i,(lo,hi) in enumerate(BINS):
                if lo <= expected < hi:
                    rows[i].append((expected, measured-expected, point.get('reflectivity')))
                    break
    summary = []
    for (lo,hi), values in zip(BINS,rows):
        if len(values) < 500:
            raise ValueError(f'Range bin {lo}..{hi} requires >=500 accepted points')
        residuals = [v[1] for v in values]
        median = statistics.median(residuals)
        robust_sigma = 1.4826*statistics.median(abs(v-median) for v in residuals)
        summary.append({'range_m':[lo,hi if math.isfinite(hi) else None], 'n':len(values), 'mean_r2':statistics.mean(v[0]**2 for v in values), 'bias_m':statistics.mean(residuals), 'std_m':statistics.stdev(residuals), 'robust_std_m':robust_sigma})
    # Nonnegative least squares for variance = sigma0^2 + k^2 * r^2.
    xs=[v['mean_r2'] for v in summary];ys=[v['std_m']**2 for v in summary]
    xm,ym=statistics.mean(xs),statistics.mean(ys)
    slope=sum((x-xm)*(y-ym) for x,y in zip(xs,ys))/sum((x-xm)**2 for x in xs)
    intercept=ym-slope*xm
    choices=[(max(0,ym),0),(0,max(0,sum(x*y for x,y in zip(xs,ys))/sum(x*x for x in xs)))]
    if slope>=0 and intercept>=0:
        choices.append((intercept,slope))
    a,b=min(choices,key=lambda ab:sum((y-ab[0]-ab[1]*x)**2 for x,y in zip(xs,ys)))
    for row in summary:
        row['predicted_std_m']=math.sqrt(a+b*row['mean_r2'])
        row['relative_error']=abs(row['predicted_std_m']/max(1e-12,row['std_m'])-1)
    return {'schema':1,'candidate_sigma0_m':math.sqrt(a),'candidate_slope_m_per_m':math.sqrt(b),'bins':summary,'within_30_percent_all_bins':all(r['relative_error']<=.3 for r in summary),'field_calibrated':False,'training_approved':False,'applied_to_simulator':False,'source_sha256':data['source_sha256'],'metadata_sha256':data['metadata_sha256'],'limitations':'Candidate fit only. Independent capture validation, reflectance-stratified residuals, survey/angle accuracy and motion checks remain necessary. No plane-residual-as-radial shortcut.'}

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('input');parser.add_argument('--out',required=True);args=parser.parse_args()
    report=fit(json.loads(Path(args.input).read_text(encoding='utf-8')))
    with Path(args.out).open('x',encoding='utf-8') as handle:
        json.dump(report,handle,ensure_ascii=False,indent=2,allow_nan=False)
    print(json.dumps(report,ensure_ascii=False))
