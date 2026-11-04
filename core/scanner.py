"""
scanner.py - Scanner inteligente de episódios e extração de metadados via ffprobe
"""
import os
import re
import json
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any
from .models import EpisodeInfo, StreamInfo
from .chapters import ChapterAnalyzer
from .platform_adapter import PlatformAdapter


class EpisodeScanner:
    VIDEO_EXTENSIONS = {".mkv", ".mp4", ".m4v"}

    # Padrões de detecção de Temporada e Episódio
    REGEX_PATTERNS = [
        # S01E01 ou S1E1
        re.compile(r"S(?P<season>\d{1,2})[\s._-]*E(?P<episode>\d{1,3})", re.IGNORECASE),
        # 1x01
        re.compile(r"(?P<season>\d{1,2})x(?P<episode>\d{1,3})", re.IGNORECASE),
        # Season 1 - 01 ou Temporada 1 - 01
        re.compile(r"(?:season|temporada)\s*(?P<season>\d{1,2})[\s._-]+(?:ep|episodio)?[\s._-]*(?P<episode>\d{1,3})", re.IGNORECASE),
        # [Fansub] Anime - 01 [1080p]
        re.compile(r"[-_]\s*(?P<episode>\d{1,3})\s*(?:\[|\(|\.mkv)", re.IGNORECASE),
        # Ep 01 ou Episode 01
        re.compile(r"(?:ep|episode|episodio)\.?\s*(?P<episode>\d{1,3})", re.IGNORECASE),
        # Apenas número no final do nome: Nome 01.mkv
        re.compile(r"\b(?P<episode>\d{1,3})\b(?=[^/]*\.(?:mkv|mp4)$)", re.IGNORECASE),
    ]

    MOVIE_PATTERN = re.compile(
        r"(?:movie\s*(?P<mov_num>\d*)|filme\s*(?P<mov_num2>\d*)|gekijouban)",
        re.IGNORECASE
    )

    @classmethod
    def format_duration(cls, seconds: float) -> str:
        s = int(round(seconds))
        h = s // 3600
        m = (s % 3600) // 60
        sec = s % 60
        if h > 0:
            return f"{h}h {m:02d}m"
        return f"{m}m {sec:02d}s"

    @classmethod
    def parse_filename(cls, filename: str) -> Tuple[int, int, str, bool]:
        """
        Extrai (temporada, episodio, display_code, is_movie) do nome do arquivo.
        """
        base = os.path.splitext(filename)[0]

        # Verifica se é filme
        m_mov = cls.MOVIE_PATTERN.search(base)
        if m_mov:
            num_str = m_mov.group("mov_num") or m_mov.group("mov_num2") or "1"
            mov_num = int(num_str) if num_str.isdigit() else 1
            return 0, mov_num, f"MOVIE_{mov_num:02d}", True

        for pat in cls.REGEX_PATTERNS:
            match = pat.search(filename)
            if match:
                groups = match.groupdict()
                season = int(groups.get("season", 1))
                episode = int(groups.get("episode", 1))
                return season, episode, f"S{season:02d}E{episode:02d}", False

        # Fallback genérico se nada casar
        return 1, 1, "EP_01", False

    @classmethod
    def probe_streams(cls, file_path: str) -> Tuple[float, List[StreamInfo], str]:
        """
        Consulta streams e duração do arquivo via ffprobe.
        Retorna (duracao_segundos, lista_streams, resumo_audio).
        """
        ffprobe = PlatformAdapter.get_ffprobe()
        cmd = [
            ffprobe,
            "-v", "error",
            "-show_entries", "format=duration:stream=index,codec_type,codec_name,channels,channel_layout,tags",
            "-of", "json",
            file_path
        ]
        res = PlatformAdapter.run_command(cmd, check=False)
        if res.returncode != 0 or not res.stdout:
            return 0.0, [], "Desconhecido"

        try:
            data = json.loads(res.stdout)
            duration = float(data.get("format", {}).get("duration", 0.0))
            raw_streams = data.get("streams", [])
            streams: List[StreamInfo] = []

            audio_tracks = []
            sub_tracks = []
            for s in raw_streams:
                c_type = s.get("codec_type", "")
                tags = s.get("tags", {})
                lang = tags.get("language", tags.get("LANGUAGE", "und"))
                title = tags.get("title", tags.get("TITLE", ""))

                st = StreamInfo(
                    index=int(s.get("index", 0)),
                    codec_type=c_type,
                    codec_name=s.get("codec_name", ""),
                    language=lang,
                    title=title,
                    channels=s.get("channels"),
                    channel_layout=s.get("channel_layout")
                )
                streams.append(st)
                if c_type == "audio":
                    audio_tracks.append(lang.upper())
                elif c_type == "subtitle":
                    sub_tracks.append(lang.upper() if lang != "und" else (title or "SUB"))

            # Resumo de áudio
            if len(audio_tracks) >= 2:
                langs = "/".join(set(audio_tracks))
                audio_summary = f"Dual Audio ({langs})"
            elif len(audio_tracks) == 1:
                audio_summary = f"Áudio Único ({audio_tracks[0]})"
            else:
                audio_summary = "Sem Faixa de Áudio"

            # Resumo de legendas embutidas
            sub_count = len(sub_tracks)
            if sub_count >= 2:
                langs_sub = "/".join(set(sub_tracks))
                sub_summary = f"{sub_count} Legendas ({langs_sub})"
            elif sub_count == 1:
                sub_summary = f"1 Legenda ({sub_tracks[0]})"
            else:
                sub_summary = "Sem Legendas"

            return duration, streams, audio_summary, sub_count, sub_summary
        except Exception:
            return 0.0, [], "Erro de leitura", 0, "Sem Legendas"

    @classmethod
    def find_external_subtitle(cls, video_path: Path, season: int, ep_num: int) -> Optional[str]:
        """Procura por arquivo de legenda externa (.srt, .ass, .vtt) associado ao episódio."""
        stem = video_path.stem
        parent = video_path.parent
        candidates = [
            f"{stem}.pt-br.ass", f"{stem}.pt-br.srt",
            f"{stem}.pt.ass", f"{stem}.pt.srt",
            f"{stem}_pt-br.ass", f"{stem}_pt-br.srt",
            f"{stem}_pt.ass", f"{stem}_pt.srt",
            f"{stem}_bra.ass", f"{stem}_bra.srt",
            f"{stem}.ass", f"{stem}.srt", f"{stem}.vtt",
        ]
        # 1. Procura na mesma pasta do vídeo
        for c in candidates:
            p = parent / c
            if p.is_file():
                return str(p.resolve())

        # 2. Procura em subpastas de legendas (subs, subtitles, legendas)
        for sub_dir_name in ["subs", "subtitles", "legendas"]:
            sub_dir = parent / sub_dir_name
            if sub_dir.is_dir():
                for c in candidates:
                    p = sub_dir / c
                    if p.is_file():
                        return str(p.resolve())
                # Procura por qualquer .srt/.ass que combine com o número do episódio
                for f in sub_dir.glob("*.srt"):
                    if f"s{season:02d}e{ep_num:02d}".lower() in f.name.lower() or f"{ep_num:02d}" in f.name:
                        return str(f.resolve())
                for f in sub_dir.glob("*.ass"):
                    if f"s{season:02d}e{ep_num:02d}".lower() in f.name.lower() or f"{ep_num:02d}" in f.name:
                        return str(f.resolve())

        return None

    @classmethod
    def scan_directory(cls, dir_path: str) -> List[EpisodeInfo]:
        """
        Varre recursivamente o diretório de origem em busca de arquivos de vídeo,
        ordenando-os cronologicamente por temporada e episódio.
        """
        root_path = Path(dir_path)
        if not root_path.is_dir():
            return []

        found_files: List[Path] = []
        for root, dirs, files in os.walk(root_path):
            # Ignora pastas de controle, temporárias ou lixeira
            dirs[:] = [d for d in dirs if not d.startswith(".") and d.lower() not in {"nc", "temp", "tmp"}]
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in cls.VIDEO_EXTENSIONS:
                    found_files.append(Path(root) / f)

        episodes: List[EpisodeInfo] = []
        for file_p in found_files:
            file_name = file_p.name
            season, ep_num, code, is_movie = cls.parse_filename(file_name)

            # Extração de streams e duração
            dur, streams, audio_summary, sub_count, sub_summary = cls.probe_streams(str(file_p))

            # Detecção de legenda externa (.srt, .ass, etc.)
            ext_sub = cls.find_external_subtitle(file_p, season, ep_num)
            if ext_sub:
                sub_count += 1
                sub_summary = f"{sub_summary} + Externa (PT-BR)" if sub_count > 1 else "1 Legenda Externa (PT-BR)"

            # Extração de capítulos
            chapters = ChapterAnalyzer.probe_chapters(str(file_p))
            has_chapters = len(chapters) > 0
            has_op_ed = any(c.is_op or c.is_ed for c in chapters)

            # Tenta limpar o título para visualização
            clean_title = file_p.stem
            # Remove marcas de resolução ou fansub
            clean_title = re.sub(r"\[.*?\]|\(.*?\)", "", clean_title).strip()
            clean_title = re.sub(r"^S\d+E\d+[\s._-]*", "", clean_title, flags=re.IGNORECASE).strip()
            if not clean_title:
                clean_title = f"Episódio {ep_num}"

            episodes.append(EpisodeInfo(
                file_path=str(file_p.resolve()),
                file_name=file_name,
                season=season,
                episode_num=ep_num,
                display_code=code,
                title=clean_title,
                duration_seconds=dur,
                duration_formatted=cls.format_duration(dur),
                has_chapters=has_chapters,
                has_op_ed=has_op_ed,
                chapters=chapters,
                streams=streams,
                audio_summary=audio_summary,
                subtitles_count=sub_count,
                subtitles_summary=sub_summary,
                external_sub_path=ext_sub,
                external_sub_delay_ms=0,
                is_movie=is_movie
            ))

        # Ordena: Filmes por último ou por código, episódios por (season, episode)
        episodes.sort(key=lambda x: (x.is_movie, x.season, x.episode_num, x.file_name))
        return episodes
