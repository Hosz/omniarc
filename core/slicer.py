"""
slicer.py - Fatiador Lossless de Episódios (Remoção de OP e ED)
"""
import os
import shutil
from pathlib import Path
from typing import Optional, Callable, List
from .models import EpisodeInfo
from .chapters import ChapterAnalyzer
from .platform_adapter import PlatformAdapter


class EpisodeSlicer:
    @classmethod
    def slice_episode(
        cls,
        ep: EpisodeInfo,
        temp_dir: str,
        strip_op_ed: bool = True,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> str:
        """
        Processa um episódio para o diretório temporário.
        Se strip_op_ed for True e houver capítulos de OP/ED, fatia sem re-encode.
        Caso contrário, utiliza link simbólico ou caminho direto.
        Retorna o caminho do arquivo pronto para concatenação.
        """
        temp_path = Path(temp_dir).resolve()
        temp_path.mkdir(parents=True, exist_ok=True)

        base_name = Path(ep.file_path).stem
        output_cut_file = temp_path / f"{base_name}_cut.mkv"

        # Se já foi fatiado e existe, reutiliza
        if output_cut_file.is_file() and output_cut_file.stat().st_size > 1024:
            if on_progress:
                on_progress(f"Arquivo fatiado em cache: {output_cut_file.name}")
            return str(output_cut_file)

        # Se não deve cortar OP/ED ou se for filme
        if not strip_op_ed or ep.is_movie:
            if PlatformAdapter.IS_LINUX:
                symlink_target = temp_path / f"{base_name}_linked.mkv"
                PlatformAdapter.create_symlink_or_copy(ep.file_path, str(symlink_target))
                return str(symlink_target)
            return ep.file_path

        # Analisa capítulos a serem mantidos
        intervals, has_cuts = ChapterAnalyzer.get_kept_intervals(ep.chapters, ep.duration_seconds)

        if not has_cuts or len(intervals) <= 1:
            if on_progress:
                on_progress(f"Sem corte de OP/ED para {ep.display_code} (mantido integral).")
            if PlatformAdapter.IS_LINUX:
                symlink_target = temp_path / f"{base_name}_linked.mkv"
                PlatformAdapter.create_symlink_or_copy(ep.file_path, str(symlink_target))
                return str(symlink_target)
            return ep.file_path

        if on_progress:
            on_progress(f"Fatiando {ep.display_code}: mantendo {len(intervals)} segmentos (removendo OP/ED)...")

        ffmpeg = PlatformAdapter.get_ffmpeg()
        part_files: List[Path] = []
        part_list_file = temp_path / f"parts_{base_name}.txt"

        try:
            # 1. Extração de cada segmento lossless
            with open(part_list_file, "w", encoding="utf-8") as f_list:
                for idx, (start_t, end_t, title) in enumerate(intervals):
                    part_out = temp_path / f"part_{base_name}_{idx}.mkv"
                    part_files.append(part_out)

                    cmd_slice = [
                        ffmpeg,
                        "-nostdin",
                        "-v", "error",
                        "-ss", str(start_t),
                        "-to", str(end_t),
                        "-i", ep.file_path,
                        "-c", "copy",
                        "-map", "0",
                        "-avoid_negative_ts", "make_zero",
                        "-y",
                        str(part_out)
                    ]
                    PlatformAdapter.run_command(cmd_slice, check=True)
                    f_list.write(f"{PlatformAdapter.format_ffmpeg_concat_path(str(part_out))}\n")

            # 2. Concatenação dos segmentos do episódio
            cmd_concat = [
                ffmpeg,
                "-nostdin",
                "-v", "error",
                "-f", "concat",
                "-safe", "0",
                "-i", str(part_list_file),
                "-c", "copy",
                "-map", "0:v",
                "-map", "0:a",
                "-map", "0:s?",
                "-y",
                str(output_cut_file)
            ]
            PlatformAdapter.run_command(cmd_concat, check=True)

            if on_progress:
                on_progress(f"Concluído corte de {ep.display_code} -> {output_cut_file.name}")

            return str(output_cut_file)

        finally:
            # Limpeza das partes intermediárias de corte do episódio
            if part_list_file.exists():
                part_list_file.unlink()
            for p in part_files:
                if p.exists():
                    p.unlink()
