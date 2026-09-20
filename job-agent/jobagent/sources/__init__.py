from .remotive import RemotiveSource
from .remoteok import RemoteOKSource
from .adzuna import AdzunaSource

ALL_SOURCES = [RemotiveSource(), RemoteOKSource(), AdzunaSource()]

__all__ = ["ALL_SOURCES", "RemotiveSource", "RemoteOKSource", "AdzunaSource"]
