"""Regression checks for bounded names in the inspected protected metadata pool."""
import importlib.util
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location('controller_metadata', Path(__file__).with_name('inspect-controller-metadata.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

data = bytearray(2048)
struct.pack_into('<II', data, 0, 0x12724394, 0xec9e4b18)
for i, name in enumerate(module.TABLES):
    struct.pack_into('<II', data, 8 + i * 8, 512 if name == 'string' else 2048,
                     1536 if name == 'string' else 0)
data[512:520] = b'Scripts\0'
data[544:544+11] = b'fadeInTime\0'.translate(module.XOR66)
data[576:576+13] = '教学名称'.encode('utf8') + b'\0'
reader = module.ControllerMetadata(data)
# ASCII 'f' encrypts to 0x00; it must not be read as an empty name.
assert reader.string(0) == 'Scripts'
assert reader.string(8) == ''
assert reader.string(32) == 'fadeInTime'
assert reader.string(64) == '教学名称'
assert reader.string(-1).startswith('<unresolved-')
assert reader.string(1536).startswith('<unresolved-')
# A terminator beyond the 512-byte cap is ignored, even inside the name pool.
data[640:1240] = b'\x01' * 600
data[1240] = 0
reader = module.ControllerMetadata(data)
assert reader.string(128).startswith('<unresolved-')
# Do not search the byte after the string-table boundary.
data[2047] = 1
reader = module.ControllerMetadata(data)
assert reader.string(1535).startswith('<unresolved-')
assert reader.usage(0x2001897b)['resolved'] is False
try:
    reader.row('fields', '<3I', 0)
except ValueError:
    pass
else:
    raise AssertionError('Out-of-range row must fail')
broken = data[:]
struct.pack_into('<II', broken, 8, 2040, 32)
try:
    module.ControllerMetadata(broken)
except ValueError:
    pass
else:
    raise AssertionError('Table extending past EOF must fail')
encoded=data[:]
struct.pack_into('<II',encoded,8+module.TABLES.index('fields')*8,1024,12)
encoded[1024:1036]=struct.pack('<3I',32,15196,0x04000001).translate(module.XOR66)
decoded=module.ControllerMetadata(encoded)
assert decoded.row('fields','<3I',0)==(32,15196,0x04000001)
assert decoded.string(32)=='fadeInTime'
print('PASS bounded plaintext/XOR names, encrypted leading f, empty namespace, missing terminators, EOF/table bounds and unresolved registrations.')
