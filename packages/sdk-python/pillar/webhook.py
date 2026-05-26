import time,hmac,hashlib,json
from .generated import Event
def construct_event(payload: bytes, sig_header: str, secret: str, tolerance: int = 300) -> Event:
    parts=dict(p.split('=',1) for p in sig_header.split(',') if '=' in p)
    ts=int(parts.get('t','0')); sig=parts.get('v1','')
    if abs(int(time.time())-ts)>tolerance: raise ValueError('Pillar signature timestamp outside tolerance')
    expected=hmac.new(secret.encode(), str(ts).encode()+b'.'+payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig): raise ValueError('Pillar signature verification failed')
    return Event.model_validate(json.loads(payload))
