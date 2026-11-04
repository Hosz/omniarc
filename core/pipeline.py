"""
pipeline.py - Orquestrador do pipeline de processamento (Fatiamento + Concatenação + Validação)
"""
import os
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List
from .models import ArcBlock, EpisodeInfo, ProjectConfig
from .slicer import EpisodeSlicer
from .concatenator import MovieConcatenator
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
        2. Concatenação dos trechos fatiados
        3. Validação do arquivo gerado
        4. Limpeza opcional dos temporários
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

        # Etapa 1: Fatiamento de cada episódio
        sliced_files: List[str] = []
        total_movie_duration = 0.0

        for idx, ep_path in enumerate(arc.episode_paths):
            if self._cancelled:
                report("cancelled", 0.0, "Operação cancelada pelo usuário.")
                return {"success": False, "error": "Cancelado"}

            ep_info = episodes_map.get(ep_path)
            if not ep_info:
                # Se não estiver no mapa, tenta criar um objeto básico
                ep_info = EpisodeInfo(
                    file_path=ep_path,
                    file_name=Path(ep_path).name
                )

            total_movie_duration += ep_info.duration_seconds
            ep_pct = (idx / total_eps) * 40.0  # Fatiamento ocupa 0% a 40%

            is_first_ep = (idx == 0)
            is_last_ep = (idx == total_eps - 1)
            keep_op_for_this = bool(arc.keep_first_op and is_first_ep)
            keep_ed_for_this = bool(arc.keep_last_ed and is_last_ep)

            report("slicing", ep_pct, f"[{idx+1}/{total_eps}] Processando {ep_info.display_code}...")

            sliced_file = EpisodeSlicer.slice_episode(
                ep=ep_info,
                temp_dir=str(temp_p),
                strip_op_ed=arc.strip_op_ed,
                keep_op=keep_op_for_this,
                keep_ed=keep_ed_for_this,
                on_progress=lambda m: report("slicing", ep_pct, m)
            )
            sliced_files.append(sliced_file)

        if self._cancelled:
            report("cancelled", 0.0, "Operação cancelada pelo usuário.")
            return {"success": False, "error": "Cancelado"}

        # Etapa 2: Concatenação Lossless
        report("concatenating", 45.0, f"Unindo {len(sliced_files)} episódios em {arc.output_filename}...")

        def concat_progress(pct: float, msg: str):
            overall_pct = 45.0 + (pct * 0.50)  # Concatenação ocupa 45% a 95%
            report("concatenating", overall_pct, msg)

        concat_ok = MovieConcatenator.concatenate(
            input_files=sliced_files,
            output_path=str(final_movie_path),
            temp_dir=str(temp_p),
            total_duration=total_movie_duration,
            on_progress=concat_progress,
            cancel_check=self.is_cancelled
        )

        if not concat_ok:
            if self._cancelled:
                return {"success": False, "error": "Cancelado"}
            return {"success": False, "error": "Falha na concatenação do FFmpeg."}

        # Etapa 3: Validação de Integridade
        report("validating", 96.0, "Validando integridade e faixas de áudio...")
        validation_result = MovieValidator.validate(str(final_movie_path))

        # Etapa 4: Limpeza
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
