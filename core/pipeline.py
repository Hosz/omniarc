"""
pipeline.py - Orquestrador do pipeline de processamento (Fatiamento + Concatenação + Unificação de Legendas/Capítulos + Validação)
"""
import os
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List, Tuple
from .models import ArcBlock, EpisodeInfo, ProjectConfig
from .slicer import EpisodeSlicer
from .concatenator import MovieConcatenator
from .subtitles import SubtitleProcessor
from .validator import MovieValidator


class BuildPipeline:
    def __init__(self):
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def is_cancelled(self) -> bool:
        return self._cancelled

    def build_arc(
        self,
        arc: ArcBlock,
        episodes_map: Dict[str, EpisodeInfo],
        output_dir: str,
        temp_dir: str,
        clean_temp: bool = True,
        on_progress: Optional[Callable[[Dict[str, Any]], None]] = None
    ) -> Dict[str, Any]:
        """
        Executa o pipeline completo para um bloco de arco:
        1. Fatiamento dos episódios individuais (removendo OP/ED se configurado)
        2. Concatenação lossless das trilhas de vídeo e áudio
        3. Unificação e ordenação cronológica das legendas e geração de capítulos
        4. Multiplexação final (vídeo + áudio + legendas calibradas + capítulos + fontes)
        5. Validação do arquivo gerado e limpeza opcional dos temporários
        """
        self._cancelled = False
        out_p = Path(output_dir).resolve()
        out_p.mkdir(parents=True, exist_ok=True)

        final_movie_path = out_p / arc.output_filename
        temp_p = Path(temp_dir).resolve() / f"temp_{arc.code}"
        temp_p.mkdir(parents=True, exist_ok=True)

        total_eps = len(arc.episode_paths)
        if total_eps == 0:
            return {"success": False, "error": "Nenhum episódio associado a este arco."}

        def report(stage: str, pct: float, msg: str):
            if on_progress:
                on_progress({
                    "arc_id": arc.arc_id,
                    "stage": stage,
                    "percentage": round(pct, 1),
                    "message": msg
                })

        report("init", 0.0, f"Iniciando preparação do {arc.title}...")

        # Etapa 1: Fatiamento de cada episódio (Vídeo e Áudio lossless)
        sliced_files: List[str] = []
        episodes_meta: List[Tuple[EpisodeInfo, List[Tuple[float, float, str]], float]] = []
        total_movie_duration = 0.0

        for idx, ep_path in enumerate(arc.episode_paths):
            if self._cancelled:
                report("cancelled", 0.0, "Operação cancelada pelo usuário.")
                return {"success": False, "error": "Cancelado"}

            ep_info = episodes_map.get(ep_path)
            if not ep_info:
                from .scanner import EpisodeScanner
                from .chapters import ChapterAnalyzer
                season, ep_num, display_code, is_movie = EpisodeScanner.parse_filename(Path(ep_path).name)
                dur, streams, *_ = EpisodeScanner.probe_streams(ep_path)
                chaps = ChapterAnalyzer.probe_chapters(ep_path)
                ext_sub = EpisodeScanner.find_external_subtitle(Path(ep_path), season, ep_num)
                ep_info = EpisodeInfo(
                    file_path=ep_path,
                    file_name=Path(ep_path).name,
                    season=season,
                    episode_num=ep_num,
                    display_code=display_code,
                    duration_seconds=dur,
                    is_movie=is_movie,
                    chapters=chaps,
                    streams=streams,
                    external_sub_path=ext_sub
                )
            else:
                if not ep_info.chapters:
                    from .chapters import ChapterAnalyzer
                    ep_info.chapters = ChapterAnalyzer.probe_chapters(ep_path)
                if not ep_info.external_sub_path:
                    from .scanner import EpisodeScanner
                    ep_info.external_sub_path = EpisodeScanner.find_external_subtitle(
                        Path(ep_path), ep_info.season, ep_info.episode_num
                    )

            ep_pct = (idx / total_eps) * 40.0  # Fatiamento ocupa 0% a 40%

            is_first_ep = (idx == 0)
            is_last_ep = (idx == total_eps - 1)
            keep_op_for_this = bool(arc.keep_first_op and is_first_ep)
            keep_ed_for_this = bool(arc.keep_last_ed and is_last_ep)

            report("slicing", ep_pct, f"[{idx+1}/{total_eps}] Processando {ep_info.display_code}...")

            sliced_file, intervals, cut_dur = EpisodeSlicer.slice_episode(
                ep=ep_info,
                temp_dir=str(temp_p),
                strip_op_ed=arc.strip_op_ed,
                keep_op=keep_op_for_this,
                keep_ed=keep_ed_for_this,
                on_progress=lambda m: report("slicing", ep_pct, m)
            )
            sliced_files.append(sliced_file)
            episodes_meta.append((ep_info, intervals, cut_dur))
            total_movie_duration += cut_dur

        if self._cancelled:
            report("cancelled", 0.0, "Operação cancelada pelo usuário.")
            return {"success": False, "error": "Cancelado"}

        # Etapa 2: Concatenação Lossless de Vídeo e Áudio
        temp_av_movie = temp_p / f"{arc.code}_video_audio.mkv"
        report("concatenating", 40.0, f"Unindo trilhas A/V de {len(sliced_files)} episódios...")

        def concat_progress(pct: float, msg: str):
            overall_pct = 40.0 + (pct * 0.40)  # Concatenação ocupa 40% a 80%
            report("concatenating", overall_pct, msg)

        concat_ok = MovieConcatenator.concatenate(
            input_files=sliced_files,
            output_path=str(temp_av_movie),
            temp_dir=str(temp_p),
            total_duration=total_movie_duration,
            video_audio_only=True,
            on_progress=concat_progress,
            cancel_check=self.is_cancelled
        )

        if not concat_ok:
            if self._cancelled:
                return {"success": False, "error": "Cancelado"}
            return {"success": False, "error": "Falha na concatenação do vídeo e áudio."}

        if self._cancelled:
            report("cancelled", 0.0, "Operação cancelada pelo usuário.")
            return {"success": False, "error": "Cancelado"}

        # Etapa 3: Unificação de Legendas e Geração de Capítulos
        report("subtitles", 82.0, "Unificando legendas e ordenando cronologicamente...")
        unified_ass_path = temp_p / f"{arc.code}_unified.ass"
        has_subtitles = SubtitleProcessor.build_unified_ass(episodes_meta, str(unified_ass_path))

        chapters_path = temp_p / f"{arc.code}_chapters.txt"
        episodes_for_chaps = [(ep, dur) for ep, _, dur in episodes_meta]
        SubtitleProcessor.generate_chapters_file(episodes_for_chaps, str(chapters_path))

        # Etapa 4: Multiplexação Final (Vídeo + Áudio + Legendas Ordenadas + Capítulos + Fontes)
        report("muxing", 88.0, f"Multiplexando filme final: {arc.output_filename}...")
        font_source = arc.episode_paths[0] if arc.episode_paths else None
        sub_to_mux = str(unified_ass_path) if has_subtitles else None

        mux_ok = SubtitleProcessor.mux_final_movie(
            video_audio_file=str(temp_av_movie),
            output_movie_path=str(final_movie_path),
            sub_ass_path=sub_to_mux,
            chapters_path=str(chapters_path),
            font_source_path=font_source
        )

        if not mux_ok:
            if self._cancelled:
                return {"success": False, "error": "Cancelado"}
            return {"success": False, "error": "Falha na multiplexação final do contêiner Matroska."}

        # Etapa 5: Validação de Integridade
        report("validating", 96.0, "Validando integridade e faixas do filme gerado...")
        validation_result = MovieValidator.validate(str(final_movie_path))

        # Etapa 6: Limpeza
        if clean_temp and temp_p.exists():
            report("cleanup", 99.0, "Limpando arquivos temporários...")
            try:
                shutil.rmtree(temp_p, ignore_errors=True)
            except Exception:
                pass

        report("complete", 100.0, f"Filme gerado com sucesso: {arc.output_filename}!")

        return {
            "success": True,
            "movie_path": str(final_movie_path),
            "validation": validation_result
        }
