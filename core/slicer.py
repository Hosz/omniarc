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
        keep_op: bool = False,
        keep_ed: bool = False,
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
        mode_suffix = ""
        if strip_op_ed and not ep.is_movie:
            mode_suffix = f"_cut{'_kop' if keep_op else ''}{'_ked' if keep_ed else ''}"
        else:
            mode_suffix = "_full"
        output_cut_file = temp_path / f"{base_name}{mode_suffix}.mkv"

        # Se já foi fatiado e existe, reutiliza
        if output_cut_file.is_file() and output_cut_file.stat().st_size > 1024:
            if on_progress:
                on_progress(f"Arquivo fatiado em cache: {output_cut_file.name}")
            return str(output_cut_file)

        # Se não deve cortar OP/ED ou se for filme
        has_ext_sub = bool(ep.external_sub_path and Path(ep.external_sub_path).is_file())
        if not strip_op_ed or ep.is_movie:
            if has_ext_sub:
                if on_progress:
                    on_progress(f"Injetando legenda externa em {ep.display_code} (integral)...")
                ffmpeg = PlatformAdapter.get_ffmpeg()
                cmd_mux = [ffmpeg, "-nostdin", "-v", "error", "-i", ep.file_path]
                if ep.external_sub_delay_ms != 0:
                    cmd_mux.extend(["-itsoffset", f"{ep.external_sub_delay_ms / 1000.0:.3f}"])
                cmd_mux.extend([
                    "-i", ep.external_sub_path,
                    "-c", "copy",
                    "-map", "0",
                    "-map", "1:s",
                    f"-metadata:s:s:{ep.subtitles_count}", "language=por",
                    f"-metadata:s:s:{ep.subtitles_count}", "title=Português (Brasil)",
                    "-y",
                    str(output_cut_file)
                ])
                PlatformAdapter.run_command(cmd_mux, check=True)
                return str(output_cut_file)

            if PlatformAdapter.IS_LINUX:
                symlink_target = temp_path / f"{base_name}_linked.mkv"
                PlatformAdapter.create_symlink_or_copy(ep.file_path, str(symlink_target))
                return str(symlink_target)
            return ep.file_path

        # Analisa capítulos a serem mantidos
        intervals, has_cuts = ChapterAnalyzer.get_kept_intervals(
            ep.chapters, ep.duration_seconds,
            keep_op=keep_op,
            keep_ed=keep_ed
        )

        if not has_cuts or len(intervals) <= 1:
            if has_ext_sub:
                if on_progress:
                    on_progress(f"Injetando legenda externa em {ep.display_code} (sem corte OP/ED)...")
                ffmpeg = PlatformAdapter.get_ffmpeg()
                cmd_mux = [ffmpeg, "-nostdin", "-v", "error", "-i", ep.file_path]
                if ep.external_sub_delay_ms != 0:
                    cmd_mux.extend(["-itsoffset", f"{ep.external_sub_delay_ms / 1000.0:.3f}"])
                cmd_mux.extend([
                    "-i", ep.external_sub_path,
                    "-c", "copy",
                    "-map", "0",
                    "-map", "1:s",
                    f"-metadata:s:s:{ep.subtitles_count}", "language=por",
                    f"-metadata:s:s:{ep.subtitles_count}", "title=Português (Brasil)",
                    "-y",
                    str(output_cut_file)
                ])
                PlatformAdapter.run_command(cmd_mux, check=True)
                return str(output_cut_file)

            if on_progress:
                on_progress(f"Sem corte de OP/ED para {ep.display_code} (mantido integral).")
            if PlatformAdapter.IS_LINUX:
                symlink_target = temp_path / f"{base_name}_linked.mkv"
                PlatformAdapter.create_symlink_or_copy(ep.file_path, str(symlink_target))
                return str(symlink_target)
            return ep.file_path

        if on_progress:
            sub_info = " [com legenda externa PT-BR]" if has_ext_sub else ""
            on_progress(f"Fatiando {ep.display_code}{sub_info}: mantendo {len(intervals)} segmentos (removendo OP/ED)...")

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
                    ]

                    if has_ext_sub:
                        if ep.external_sub_delay_ms != 0:
                            cmd_slice.extend(["-itsoffset", f"{ep.external_sub_delay_ms / 1000.0:.3f}"])
                        cmd_slice.extend([
                            "-ss", str(start_t),
                            "-to", str(end_t),
                            "-i", ep.external_sub_path,
                            "-c", "copy",
                            "-map", "0",
                            "-map", "1:s",
                            f"-metadata:s:s:{ep.subtitles_count}", "language=por",
                            f"-metadata:s:s:{ep.subtitles_count}", "title=Português (Brasil)",
                            "-avoid_negative_ts", "make_zero",
                            "-y",
                            str(part_out)
                        ])
                    else:
                        cmd_slice.extend([
                            "-c", "copy",
                            "-map", "0",
                            "-avoid_negative_ts", "make_zero",
                            "-y",
                            str(part_out)
                        ])

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
