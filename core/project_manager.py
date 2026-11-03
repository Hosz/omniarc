"""
project_manager.py - Gestão de persistência de projetos OmniArc em formato JSON
"""
import json
from pathlib import Path
from typing import Optional, Dict, Any
from .models import ProjectConfig, ArcBlock


class ProjectManager:
    @classmethod
    def save_project(cls, config: ProjectConfig, file_path: str) -> bool:
        try:
            p = Path(file_path).resolve()
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(config.to_dict(), f, indent=2, ensure_ascii=False)
            return True
        except Exception:
            return False

    @classmethod
    def load_project(cls, file_path: str) -> Optional[ProjectConfig]:
        p = Path(file_path).resolve()
        if not p.is_file():
            return None

        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)

            arcs = []
            for arc_dict in data.get("arcs", []):
                arcs.append(ArcBlock(
                    arc_id=int(arc_dict.get("arc_id", 1)),
                    code=arc_dict.get("code", "Bloco_01"),
                    title=arc_dict.get("title", "Novo Filme"),
                    output_filename=arc_dict.get("output_filename", "Filme_01.mkv"),
                    episode_paths=arc_dict.get("episode_paths", []),
                    strip_op_ed=bool(arc_dict.get("strip_op_ed", True)),
                    estimated_duration=arc_dict.get("estimated_duration", "00h 00m")
                ))

            config = ProjectConfig(
                project_name=data.get("project_name", "Projeto"),
                source_dir=data.get("source_dir", ""),
                output_dir=data.get("output_dir", ""),
                temp_dir=data.get("temp_dir", ""),
                clean_temp_on_finish=bool(data.get("clean_temp_on_finish", True)),
                arcs=arcs
            )
            return config
        except Exception:
            return None
