class Search:
    def __init__(self, client): self.client=client
    def query(self, **params): return self.client.request('GET','/v1/search', params=params)
