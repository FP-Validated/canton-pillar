from pydantic import BaseModel
class PillarObject(BaseModel, extra='allow'):
    id: str
    object: str
class Event(PillarObject):
    type: str | None = None
