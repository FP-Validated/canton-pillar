class Page:
    def __init__(self, load): self._load=load
    def data(self): return self._load().get('data', [])
    def auto_paging_iter(self):
        cursor=None
        while True:
            page=self._load(cursor); data=page.get('data', [])
            for item in data: yield item
            if not page.get('has_more'): break
            cursor=page.get('next_cursor') or (data[-1].get('id') if data else None)
            if not cursor: break
class Resource:
    def __init__(self, client, path): self.client=client; self.path=path
    def list(self, **params): return Page(lambda cursor=None: self.client.request('GET', self.path, params={**params, **({'starting_after':cursor} if cursor else {})}))
    def retrieve(self, id): return self.client.request('GET', f'{self.path}/{id}')
    def create(self, data, **opts): return self.client.request('POST', self.path, json=data, **opts)
    def update(self, id, data, **opts): return self.client.request('POST', f'{self.path}/{id}', json=data, **opts)
