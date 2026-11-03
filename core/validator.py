"""
validator.py - Validação pós-processamento de integridade e metadados de vídeo
"""
import json
from pathlib import Path
from typing import Dict, Any
from .platform_adapter import PlatformAdapter


class MovieValidator:
    @classmethod
    def format_size(cls, size_bytes: int) -> str:
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} PB"

    @classmethod
    def format_duration(cls, seconds: float) -> str:
        s = int(round(seconds))
        h = s // 3600
        m = (s % 3600) // 60
        sec = s % 60
        return f"{h:02d}h {m:02d}m {sec:02d}s"

    @classmethod
    def validate(cls, file_path: str) -> Dict[str, Any]:
        p = Path(file_path).resolve()
        if not p.is_file():
            return {"valid": False, "error": f"Arquivo não encontrado: {file_path}"}

        size_bytes = p.stat().st_size
        if size_bytes == 0:
            return {"valid": False, "error": "Arquivo gerado possui 0 bytes!"}

        ffprobe = PlatformAdapter.get_ffprobe()
        cmd = [
            ffprobe,
            "-v", "error",
            "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,channels,tags",
            "-of", "json",
            str(p)
        ]
        res = PlatformAdapter.run_command(cmd, check=False)
        if res.returncode != 0:
            return {"valid": False, "error": "Falha ao executar ffprobe no arquivo final."}

        try:
            data = json.loads(res.stdout)
            duration = float(data.get("format", {}).get("duration", 0.0))
            streams = data.get("streams", [])

            video_streams = [s for s in streams if s.get("codec_type") == "video"]
            audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
            sub_streams = [s for s in streams if s.get("codec_type") == "subtitle"]

            video_info = "Nenhum"
            if video_streams:
                v = video_streams[0]
                video_info = f"{v.get('codec_name', 'desconhecido').upper()} ({v.get('width', 0)}x{v.get('height', 0)})"

            audio_langs = []
            for a in audio_streams:
                tags = a.get("tags", {})
                lang = tags.get("language", tags.get("LANGUAGE", "und"))
                audio_langs.append(f"{lang.upper()}:{a.get('codec_name', '')}")

            return {
                "valid": True,
                "file_name": p.name,
                "file_path": str(p),
                "file_size": cls.format_size(size_bytes),
                "duration_seconds": duration,
                "duration_formatted": cls.format_duration(duration),
                "video": video_info,
                "audio_count": len(audio_streams),
                "audio_details": ", ".join(audio_langs) if audio_langs else "Nenhuma",
                "subtitle_count": len(sub_streams)
            }
        except Exception as e:
            return {"valid": False, "error": f"Erro ao analisar JSON do ffprobe: {str(e)}"}
