import json,time,hmac,hashlib,pytest
from pillar.webhook import construct_event
from pillar.resource import Page
def sign(payload, secret='whsec', ts=None):
    ts=ts or int(time.time()); sig=hmac.new(secret.encode(), f'{ts}.'.encode()+payload, hashlib.sha256).hexdigest(); return f't={ts},v1={sig}'
def test_auto_paging_iter():
    pages=[{'data':[{'id':'a'}],'has_more':True,'next_cursor':'a'},{'data':[{'id':'b'}],'has_more':False}]
    assert [x['id'] for x in Page(lambda cursor=None: pages.pop(0)).auto_paging_iter()]==['a','b']
def test_webhook_rejects_tampered_stale_json_reencoded():
    raw=b'{"b":2,"id":"evt_1","object":"event"}'; header=sign(raw)
    assert construct_event(raw,header,'whsec').id=='evt_1'
    with pytest.raises(ValueError): construct_event(b'{"b":3,"id":"evt_1","object":"event"}',header,'whsec')
    with pytest.raises(ValueError): construct_event(raw,sign(raw,ts=1),'whsec')
    with pytest.raises(ValueError): construct_event(json.dumps(json.loads(raw)).encode(),header,'whsec')
