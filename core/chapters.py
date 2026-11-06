"""
chapters.py - Análise inteligente de capítulos e detecção de OP / ED
"""
import re
import json
from typing import List, Dict, Any, Tuple
from .models import ChapterInfo
from .platform_adapter import PlatformAdapter
from .translator import ChapterTranslator


class ChapterAnalyzer:
    OP_PATTERN = re.compile(
        r"(?:opening|abertura|^\s*op\s*$|^\s*op\s*\d*|\bopening\s*song\b|オープニング)",
        re.IGNORECASE
    )
    ED_PATTERN = re.compile(
        r"(?:ending|encerramento|^\s*ed\s*$|^\s*ed\s*\d*|\bending\s*song\b|エンディング|credits?|créditos|staff)",
        re.IGNORECASE
    )
    PREVIEW_PATTERN = re.compile(
        r"(?:preview|pr[eé]via|pr[oó]ximo|next\s*episode|次回予告|予告|teaser|trailer|omake|extra|bonus)",
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

            # 1. Primeira passada: classificação por palavras-chave universais da indústria
            for chap in raw_chapters:
                start = float(chap.get("start_time", 0.0))
                end = float(chap.get("end_time", 0.0))
                tags = chap.get("tags", {})
                title = tags.get("title", tags.get("TITLE", f"Capítulo {len(parsed) + 1}"))

                is_op = bool(cls.OP_PATTERN.search(title))
                is_ed = bool(cls.ED_PATTERN.search(title))
                is_preview = bool(cls.PREVIEW_PATTERN.search(title))
                title_pt = ChapterTranslator.translate_title(title, enable_online=False)

                parsed.append(ChapterInfo(
                    start_time=start,
                    end_time=end,
                    title=title,
                    is_op=is_op,
                    is_ed=is_ed or is_preview,
                    kept=True,
                    title_pt=title_pt
                ))

            # 2. Heurística temporal / posicional genérica (Fallback para arquivos sem nomes descritivos, ex: BD-Rips com "Chapter 01", "Chapter 02")
            has_op = any(c.is_op for c in parsed)
            has_ed = any(c.is_ed for c in parsed)
            if not has_op or not has_ed:
                total_dur = parsed[-1].end_time if parsed else 0.0
                for c in parsed:
                    dur = c.end_time - c.start_time
                    # Padrão universal de Anime/Séries (~85s a ~95s de música de abertura/encerramento)
                    if 80.0 <= dur <= 100.0:
                        if not has_op and c.start_time < 360.0:
                            c.is_op = True
                            has_op = True
                        elif not has_ed and total_dur > 600.0 and c.start_time > (total_dur - 360.0):
                            c.is_ed = True
                            has_ed = True

            # 3. Regra Estrutural Universal de Sequência:
            # Qualquer capítulo posicionado a partir do Encerramento (inclusive) até o final do arquivo
            # (ex: prévias, curtas pós-créditos, omakes ou nomes específicos de animes) é tratado
            # automaticamente como parte do bloco de encerramento / extras a serem cortados.
            has_seen_ed = False
            for c in parsed:
                if c.is_ed:
                    has_seen_ed = True
                elif has_seen_ed:
                    c.is_ed = True

            return parsed
        except Exception:
            return []

    @classmethod
    def get_kept_intervals(
        cls,
        chapters: List[ChapterInfo],
        total_duration: float,
        keep_op: bool = False,
        keep_ed: bool = False
    ) -> Tuple[List[Tuple[float, float, str]], bool]:
        """
        Calcula os intervalos contínuos a serem mantidos.
        Prioriza seleções manuais do usuário (c.kept == False).
        Fallback para remoção automática de OP/ED caso nenhuma seleção manual tenha sido feita.
        keep_op: se True, preserva a abertura (útil no 1º episódio do filme).
        keep_ed: se True, preserva o encerramento (útil no último episódio do filme).
        Retorna:
          (intervalos: [(inicio, fim, titulo)], op_ed_detectado: bool)
        """
        if not chapters:
            return [(0.0, total_duration, "Episódio Integral")], False

        # 1. Se o usuário desmarcou capítulos manualmente na interface:
        has_custom_cuts = any(not c.kept for c in chapters)
        if has_custom_cuts:
            kept_chapters = [c for c in chapters if c.kept]
            if not kept_chapters:
                return [(0.0, total_duration, "Episódio Integral")], False

            intervals: List[Tuple[float, float, str]] = []
            for c in kept_chapters:
                lbl = c.title_pt or c.title
                if intervals and abs(intervals[-1][1] - c.start_time) < 0.5:
                    prev_start, _, prev_title = intervals.pop()
                    intervals.append((prev_start, c.end_time, f"{prev_title} + {lbl}"))
                else:
                    intervals.append((c.start_time, c.end_time, lbl))

            return intervals, True

        # 2. Regra padrão automática baseada em OP/ED:
        has_op_or_ed = any(c.is_op or c.is_ed for c in chapters)
        if not has_op_or_ed:
            return [(0.0, total_duration, "Episódio Integral (Sem corte OP/ED)")], False

        # Descarta OP somente se keep_op for False; descarta ED somente se keep_ed for False
        kept_chapters = [
            c for c in chapters 
            if not ((c.is_op and not keep_op) or (c.is_ed and not keep_ed))
        ]

        if not kept_chapters or len(kept_chapters) == len(chapters):
            return [(0.0, total_duration, "Episódio Integral")], False

        # Agrupa capítulos contíguos em intervalos maiores para otimizar cortes
        intervals = []
        for c in kept_chapters:
            lbl = c.title_pt or c.title
            if intervals and abs(intervals[-1][1] - c.start_time) < 0.5:
                prev_start, _, prev_title = intervals.pop()
                intervals.append((prev_start, c.end_time, f"{prev_title} + {lbl}"))
            else:
                intervals.append((c.start_time, c.end_time, lbl))

        return intervals, True
