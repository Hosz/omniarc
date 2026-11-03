"""
chapters.py - Análise inteligente de capítulos e detecção de OP / ED
"""
import re
import json
from typing import List, Dict, Any, Tuple
from .models import ChapterInfo
from .platform_adapter import PlatformAdapter


class ChapterAnalyzer:
    OP_PATTERN = re.compile(
        r"(?:opening|abertura|^\s*op\s*$|^\s*op\s*\d*|\bopening\s*song\b)",
        re.IGNORECASE
    )
    ED_PATTERN = re.compile(
        r"(?:ending|encerramento|^\s*ed\s*$|^\s*ed\s*\d*|\bending\s*song\b)",
        re.IGNORECASE
    )

    @classmethod
    def probe_chapters(cls, file_path: str) -> List[ChapterInfo]:
        """Extrai a lista de capítulos de um arquivo MKV/MP4 via ffprobe."""
        ffprobe = PlatformAdapter.get_ffprobe()
        cmd = [
            ffprobe,
            "-v", "error",
            "-print_format", "json",
            "-show_chapters",
            file_path
        ]
        res = PlatformAdapter.run_command(cmd, check=False)
        if res.returncode != 0 or not res.stdout:
            return []

        try:
            data = json.loads(res.stdout)
            raw_chapters = data.get("chapters", [])
            parsed: List[ChapterInfo] = []

            for chap in raw_chapters:
                start = float(chap.get("start_time", 0.0))
                end = float(chap.get("end_time", 0.0))
                tags = chap.get("tags", {})
                title = tags.get("title", tags.get("TITLE", f"Capítulo {len(parsed) + 1}"))

                is_op = bool(cls.OP_PATTERN.search(title))
                is_ed = bool(cls.ED_PATTERN.search(title))

                parsed.append(ChapterInfo(
                    start_time=start,
                    end_time=end,
                    title=title,
                    is_op=is_op,
                    is_ed=is_ed
                ))
            return parsed
        except Exception:
            return []

    @classmethod
    def get_kept_intervals(cls, chapters: List[ChapterInfo], total_duration: float) -> Tuple[List[Tuple[float, float, str]], bool]:
        """
        Calcula os intervalos contínuos a serem mantidos (sem OP e sem ED).
        Retorna:
          (intervalos: [(inicio, fim, titulo)], op_ed_detectado: bool)
        """
        if not chapters:
            return [(0.0, total_duration, "Episódio Integral")], False

        # Verifica se pelo menos uma abertura ou encerramento foi detectado
        has_op_or_ed = any(c.is_op or c.is_ed for c in chapters)
        if not has_op_or_ed:
            # Sem marcadores explícitos: mantém o arquivo integral
            return [(0.0, total_duration, "Episódio Integral (Sem corte OP/ED)")], False

        # Capítulos que NÃO são nem OP nem ED
        kept_chapters = [c for c in chapters if not (c.is_op or c.is_ed)]

        if not kept_chapters or len(kept_chapters) == len(chapters):
            return [(0.0, total_duration, "Episódio Integral")], False

        # Agrupa capítulos contíguos em intervalos maiores para otimizar cortes
        intervals: List[Tuple[float, float, str]] = []
        for c in kept_chapters:
            # Se o capítulo atual começa exatamente onde o anterior terminou, podemos juntar
            if intervals and abs(intervals[-1][1] - c.start_time) < 0.1:
                prev_start, _, prev_title = intervals.pop()
                intervals.append((prev_start, c.end_time, f"{prev_title} + {c.title}"))
            else:
                intervals.append((c.start_time, c.end_time, c.title))

        return intervals, True
