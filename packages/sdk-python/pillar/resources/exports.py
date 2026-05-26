class Exports:
    def __init__(self, client): self.client=client
    def create(self, data, idempotency_key): return self.client.request('POST','/v1/exports', json=data, idempotency_key=idempotency_key)
    def list(self, **params): return self.client.request('GET','/v1/exports', params=params)
    def get(self, id): return self.client.request('GET',f'/v1/exports/{id}')
    def download(self, id): return self.client.request('POST',f'/v1/exports/{id}/download_url', idempotency_key='download-'+id)
