"""
slicer.py - Fatiador Lossless de Episódios (Remoção de OP e ED)
"""
import os
import shutil
from pathlib import Path
from typing import Optional, Callable, List, Tuple
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
        keep_op: bool = False,
        keep_ed: bool = False,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Tuple[str, List[Tuple[float, float, str]], float]:
        """
        Processa um episódio para o diretório temporário (fatiamento lossless de vídeo e áudio).
        Se strip_op_ed for True e houver capítulos de OP/ED, fatia sem re-encode.
        Retorna:
          (caminho_arquivo_fatiado, intervalos_mantidos, duracao_total_mantida)
        """
        temp_path = Path(temp_dir).resolve()
        temp_path.mkdir(parents=True, exist_ok=True)

        base_name = Path(ep.file_path).stem
        mode_suffix = ""
        if strip_op_ed and not ep.is_movie:
            mode_suffix = f"_cut{'_kop' if keep_op else ''}{'_ked' if keep_ed else ''}"
        else:
            mode_suffix = "_full"
        output_cut_file = temp_path / f"{base_name}{mode_suffix}.mkv"

        # Se não deve cortar OP/ED ou se for filme
        if not strip_op_ed or ep.is_movie:
            intervals = [(0.0, ep.duration_seconds, "Episódio Integral")]
            if output_cut_file.is_file() and output_cut_file.stat().st_size > 1024:
                return str(output_cut_file), intervals, ep.duration_seconds

            if PlatformAdapter.IS_LINUX:
                symlink_target = temp_path / f"{base_name}_linked.mkv"
                PlatformAdapter.create_symlink_or_copy(ep.file_path, str(symlink_target))
                return str(symlink_target), intervals, ep.duration_seconds
            return ep.file_path, intervals, ep.duration_seconds

        # Analisa capítulos a serem mantidos
        intervals, has_cuts = ChapterAnalyzer.get_kept_intervals(
            ep.chapters, ep.duration_seconds,
            keep_op=keep_op,
            keep_ed=keep_ed
        )

        cut_duration = sum(end_t - start_t for start_t, end_t, _ in intervals)

        # Se já foi fatiado e existe em cache, reutiliza
        if output_cut_file.is_file() and output_cut_file.stat().st_size > 1024:
            if on_progress:
                on_progress(f"Arquivo fatiado em cache: {output_cut_file.name}")
            return str(output_cut_file), intervals, cut_duration

        if not has_cuts or len(intervals) <= 1:
            if on_progress:
                on_progress(f"Sem corte de OP/ED para {ep.display_code} (mantido integral).")
            if PlatformAdapter.IS_LINUX:
                symlink_target = temp_path / f"{base_name}_linked.mkv"
                PlatformAdapter.create_symlink_or_copy(ep.file_path, str(symlink_target))
                return str(symlink_target), intervals, ep.duration_seconds
            return ep.file_path, intervals, ep.duration_seconds

        if on_progress:
            on_progress(f"Fatiando {ep.display_code}: mantendo {len(intervals)} segmentos (removendo OP/ED)...")

        ffmpeg = PlatformAdapter.get_ffmpeg()
        part_files: List[Path] = []
        part_list_file = temp_path / f"parts_{base_name}.txt"

        try:
            # 1. Extração de cada segmento lossless (somente vídeo e áudio para evitar corrupção de timestamps)
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
                        "-map", "0:v",
                        "-map", "0:a",
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
                "-y",
                str(output_cut_file)
            ]
            PlatformAdapter.run_command(cmd_concat, check=True)

            if on_progress:
                on_progress(f"Concluído corte de {ep.display_code} -> {output_cut_file.name}")

            return str(output_cut_file), intervals, cut_duration

        finally:
            # Limpeza das partes intermediárias de corte do episódio
            if part_list_file.exists():
                part_list_file.unlink()
            for p in part_files:
                if p.exists():
                    p.unlink()
