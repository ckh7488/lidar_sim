"""Read LSF1 without third-party dependencies; optional NumPy conversion by caller."""
import array
import gzip
import json
import struct
import sys
from pathlib import Path

def read_lsf(path):
    data = Path(path).read_bytes()
    if data[:2] == b'\x1f\x8b':
        data = gzip.decompress(data)
    if data[:4] != b'LSF1':
        raise ValueError('Invalid LSF1 file')
    size = struct.unpack_from('<I', data, 4)[0]
    metadata = json.loads(data[8:8+size])
    arrays = {}
    for name, entry in metadata['binary']['arrays'].items():
        dtype = {'Float32Array': 'f', 'Float64Array': 'd', 'Uint32Array': 'I', 'Uint8Array': 'B'}[entry['type']]
        start = 8 + size + entry['offset']
        if entry['offset'] < 0 or entry['bytes'] < 0 or start+entry['bytes'] > len(data):
            raise ValueError('Invalid array bounds: '+name)
        value = array.array(dtype)
        value.frombytes(data[start:start+entry['bytes']])
        if sys.byteorder != 'little':
            value.byteswap()
        if len(value) != entry['length'] or len(value)*value.itemsize != entry['bytes']:
            raise ValueError('Truncated array: '+name)
        arrays[name] = value
    return metadata, arrays

if __name__ == '__main__':
    metadata, arrays = read_lsf(sys.argv[1])
    print(json.dumps({'scene': metadata['scene'], 'time': metadata['time'], 'arrays': {k: len(v) for k,v in arrays.items()}}))
