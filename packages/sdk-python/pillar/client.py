import httpx
from .error import from_response
from .resource import Resource
class LastResponse: request_id: str | None = None
class Pillar:
    def __init__(self, api_key: str, *, api_base='https://api.pillar.local', api_version='2026-05-26'):
        self.api_key=api_key; self.api_base=api_base; self.api_version=api_version; self.last_response=LastResponse()
        for name,path in {'accounts':'accounts','assets':'assets','balances':'balances','holdings':'holdings','issue_intents':'issue_intents','redeem_intents':'redeem_intents','transfer_intents':'transfer_intents','holds':'holds','operations':'operations','events':'events','webhook_endpoints':'webhook_endpoints','api_keys':'api_keys'}.items(): setattr(self,name,Resource(self,'/v1/'+path))
    def request(self, method, path, *, json=None, params=None, idempotency_key=None):
        headers={'Authorization':f'Bearer {self.api_key}','Pillar-Version':self.api_version}
        if idempotency_key: headers['Idempotency-Key']=idempotency_key
        r=httpx.request(method, self.api_base+path, json=json, params=params, headers=headers)
        self.last_response.request_id=r.headers.get('request-id')
        body=r.json() if r.content else {}
        if r.status_code>=400: raise from_response(r.status_code, body, self.last_response.request_id)
        return body
