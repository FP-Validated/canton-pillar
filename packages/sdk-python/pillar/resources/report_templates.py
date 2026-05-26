class ReportTemplates:
    def __init__(self, client): self.client=client
    def create(self, data, idempotency_key): return self.client.request('POST','/v1/report_templates', json=data, idempotency_key=idempotency_key)
    def list(self, **params): return self.client.request('GET','/v1/report_templates', params=params)
    def get(self, id): return self.client.request('GET',f'/v1/report_templates/{id}')
    def run(self, id, idempotency_key): return self.client.request('POST',f'/v1/report_templates/{id}/run', idempotency_key=idempotency_key)
