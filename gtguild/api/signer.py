import time
import os
import binascii
import hashlib
from urllib.parse import urlencode

APP_KEY = 'a5e793dd8b8e425c9bff92ed79e4458f'
APP_SECRET = 'xoNO7qa9761mNPyLtTn8zxPeX80iLnDonYCOzqS7bG8='


def get_sign(date: str = None, extra_params: dict = None) -> dict:
    data = {
        'ts': int(time.time()),
        'nonce': '-'.join([binascii.hexlify(os.urandom(3)).decode() for _ in range(3)]),
        'appkey': APP_KEY
    }
    
    if date:
        data['date'] = date
    
    if extra_params:
        data.update(extra_params)
    
    sorted_data = dict(sorted(data.items(), key=lambda x: x[0]))
    sorted_params_str = urlencode(sorted_data)
    
    sign_str = f"{sorted_params_str}&secret={APP_SECRET}"
    data['sign'] = hashlib.md5(sign_str.encode()).hexdigest()
    
    return data