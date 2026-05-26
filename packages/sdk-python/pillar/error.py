class PillarError(Exception):
    def __init__(self, message, *, request_id=None, type='api_error', status=0):
        super().__init__(message); self.request_id=request_id; self.type=type; self.status=status
class AuthenticationError(PillarError): pass
class InvalidRequestError(PillarError): pass
def from_response(status, body, request_id=None):
    err=(body or {}).get('error', body or {})
    cls=AuthenticationError if err.get('type')=='authentication_error' else InvalidRequestError if err.get('type')=='invalid_request_error' else PillarError
    return cls(err.get('message', f'Pillar API request failed with status {status}'), request_id=request_id, type=err.get('type','api_error'), status=status)
