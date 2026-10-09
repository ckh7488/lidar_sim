import importlib.util
import math
import random
from pathlib import Path

spec=importlib.util.spec_from_file_location('calibrate',Path(__file__).resolve().parents[1]/'tools/calibrate_range.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
rng=random.Random(1313)
data={'sensor_state':'normal','mount_motion':'stationary','metadata_sha256':'synthetic','source_sha256':'synthetic','patches':[]}
for distance in [3,7,15,30,60]:
    points=[]
    for _ in range(8000):
        x,y=rng.uniform(-1,1),rng.uniform(-1,1)
        length=math.sqrt(distance*distance+x*x+y*y)
        direction=[x/length,y/length,distance/length]
        measured=length+rng.gauss(0,math.hypot(.02,.001*length))
        points.append({'origin':[0,0,0],'direction':direction,'range_m':measured})
    data['patches'].append({'reviewed':True,'area_m2':4,'surface_roughness_bound_m':0,'plane':[0,0,1,-distance],'points':points})
result=module.fit(data)
assert abs(result['candidate_sigma0_m']/.02-1)<.08
assert abs(result['candidate_slope_m_per_m']/.001-1)<.08
assert result['within_30_percent_all_bins']
assert result['field_calibrated'] is False
for invalid in [{'mount_motion':'36RPM'}, {'sensor_state':'faulty'}]:
    try:
        module.fit({**data,**invalid})
        raise AssertionError('Non-calibration capture was accepted')
    except ValueError:
        pass
print('PASS synthetic calibration fit and rejection of rotating/faulty captures',result['candidate_sigma0_m'],result['candidate_slope_m_per_m'])
