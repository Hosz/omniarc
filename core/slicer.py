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

        # Se não deve cortar OP/ED ou se for filme
        if not strip_op_ed or ep.is_movie:
            intervals = [(0.0, ep.duration_seconds, "Episódio Integral")]
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

        # Verifica se o episódio deve ser mantido integral (sem nenhum corte efetivo)
        is_integral = False
        if not has_cuts:
            is_integral = True
        elif len(intervals) == 1:
            start_t, end_t, _ = intervals[0]
            if start_t <= 0.5 and (ep.duration_seconds - end_t) <= 1.0:
                is_integral = True

        if is_integral:
            if on_progress:
                on_progress(f"Sem cortes para {ep.display_code} (mantido integral).")
            if PlatformAdapter.IS_LINUX:
                symlink_target = temp_path / f"{base_name}_linked.mkv"
                PlatformAdapter.create_symlink_or_copy(ep.file_path, str(symlink_target))
                return str(symlink_target), intervals, ep.duration_seconds
            return ep.file_path, intervals, ep.duration_seconds

        cut_duration = sum(end_t - start_t for start_t, end_t, _ in intervals)

        # Nome de cache baseado no hash dos intervalos exatos (evita reuso indevido se a seleção mudar)
        import hashlib
        intervals_sig = "-".join(f"{s:.2f}:{e:.2f}" for s, e, _ in intervals)
        intervals_hash = hashlib.md5(intervals_sig.encode()).hexdigest()[:8]
        output_cut_file = temp_path / f"{base_name}_cut_{intervals_hash}.mkv"

        # Se já foi fatiado com os mesmos intervalos exatos e existe em cache, reutiliza
        if output_cut_file.is_file() and output_cut_file.stat().st_size > 1024:
            if on_progress:
                on_progress(f"Arquivo fatiado em cache: {output_cut_file.name}")
            actual_dur = PlatformAdapter.probe_file_duration(str(output_cut_file))
            return str(output_cut_file), intervals, actual_dur if actual_dur > 0.0 else cut_duration

        if on_progress:
            on_progress(f"Fatiando {ep.display_code}: mantendo {len(intervals)} segmento(s) com cortes...")

        # Prioriza o fatiamento nativo via mkvmerge para arquivos Matroska (MKV).
        # Evita avanço excessivo de keyframes do ffmpeg e une os segmentos em uma única passagem atômica.
        mkvmerge = PlatformAdapter.get_mkvmerge()
        if mkvmerge and ep.file_path.lower().endswith(".mkv"):
            parts_spec = ",+".join(
                f"{PlatformAdapter.format_timestamp_mkvmerge(s)}-{PlatformAdapter.format_timestamp_mkvmerge(e)}"
                for s, e, _ in intervals
            )
            cmd_mkvmerge_slice = [
                mkvmerge,
                "-o", str(output_cut_file),
                "--no-subtitles",
                "--split", f"parts:{parts_spec}",
                ep.file_path
            ]
            res_mkv = PlatformAdapter.run_command(cmd_mkvmerge_slice, check=False)
            if res_mkv.returncode in (0, 1) and output_cut_file.is_file() and output_cut_file.stat().st_size > 1024:
                if on_progress:
                    on_progress(f"Concluído corte de {ep.display_code} (via mkvmerge) -> {output_cut_file.name}")
                actual_dur = PlatformAdapter.probe_file_duration(str(output_cut_file))
                return str(output_cut_file), intervals, actual_dur if actual_dur > 0.0 else cut_duration
            elif on_progress:
                on_progress(f"Aviso: mkvmerge falhou ao fatiar {ep.display_code}, tentando fallback via FFmpeg...")

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

            actual_dur = PlatformAdapter.probe_file_duration(str(output_cut_file))
            return str(output_cut_file), intervals, actual_dur if actual_dur > 0.0 else cut_duration

        finally:
            # Limpeza das partes intermediárias de corte do episódio
            if part_list_file.exists():
                part_list_file.unlink()
            for p in part_files:
                if p.exists():
                    p.unlink()
