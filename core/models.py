"""
models.py - Modelos de dados para o OmniArc
"""
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any


@dataclass
class ChapterInfo:
    start_time: float
    end_time: float
    title: str = "Segmento"
    is_op: bool = False
    is_ed: bool = False


@dataclass
class StreamInfo:
    index: int
    codec_type: str  # 'video', 'audio', 'subtitle'
    codec_name: str
    language: str = "und"
    title: str = ""
    channels: Optional[int] = None
    channel_layout: Optional[str] = None


@dataclass
class EpisodeInfo:
    file_path: str
    file_name: str
    season: int = 1
    episode_num: int = 1
    display_code: str = "S01E01"
    title: str = ""
    duration_seconds: float = 0.0
    duration_formatted: str = "00m 00s"
    has_chapters: bool = False
    has_op_ed: bool = False
    chapters: List[ChapterInfo] = field(default_factory=list)
    streams: List[StreamInfo] = field(default_factory=list)
    audio_summary: str = "Áudio Padrão"
    is_movie: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ArcBlock:
    arc_id: int
    code: str
    title: str
    output_filename: str
    episode_paths: List[str] = field(default_factory=list)
    strip_op_ed: bool = True
    estimated_duration: str = "00h 00m"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ProjectConfig:
    project_name: str = "Novo Projeto"
    source_dir: str = ""
    output_dir: str = ""
    temp_dir: str = ""
    clean_temp_on_finish: bool = True
    arcs: List[ArcBlock] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_name": self.project_name,
            "source_dir": self.source_dir,
            "output_dir": self.output_dir,
            "temp_dir": self.temp_dir,
            "clean_temp_on_finish": self.clean_temp_on_finish,
            "arcs": [arc.to_dict() for arc in self.arcs]
        }
