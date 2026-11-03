"""
concatenator.py - Concatenação Lossless de Múltiplos Episódios em Filme/Supercut
"""
import os
import re
import subprocess
from pathlib import Path
from typing import List, Optional, Callable, Dict, Any
from .platform_adapter import PlatformAdapter


class MovieConcatenator:
    @classmethod
    def concatenate(
        cls,
        input_files: List[str],
        output_path: str,
        temp_dir: str,
        total_duration: float = 0.0,
        on_progress: Optional[Callable[[float, str], None]] = None,
        cancel_check: Optional[Callable[[], bool]] = None
    ) -> bool:
        """
        Concatena lossless múltiplos arquivos de episódios no arquivo de saída final.
        Reporta o progresso percentual via callback.
        """
        if not input_files:
            return False

        temp_p = Path(temp_dir).resolve()
        temp_p.mkdir(parents=True, exist_ok=True)
        out_p = Path(output_path).resolve()
        out_p.parent.mkdir(parents=True, exist_ok=True)

        concat_list_file = temp_p / f"concat_list_{out_p.stem}.txt"

        # Escreve a lista formatada
        with open(concat_list_file, "w", encoding="utf-8") as f:
            for item in input_files:
                line = PlatformAdapter.format_ffmpeg_concat_path(item)
                f.write(f"{line}\n")

        ffmpeg = PlatformAdapter.get_ffmpeg()

        # Tentativa 1: map 0 (todas as streams e metadados)
        cmd = [
            ffmpeg,
            "-nostdin",
            "-v", "warning",
            "-stats",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list_file),
            "-c", "copy",
            "-map", "0",
            "-y",
            str(out_p)
        ]

        if on_progress:
            on_progress(0.0, f"Iniciando concatenação: {out_p.name}...")

        success = cls._run_ffmpeg_with_progress(
            cmd, total_duration, on_progress, cancel_check
        )

        if not success and (not cancel_check or not cancel_check()):
            # Tentativa 2: fallback para streams A/V/S sem anexos estáticos
            if on_progress:
                on_progress(0.0, "Reexecutando sem anexos de contêiner...")
            cmd_fallback = [
                ffmpeg,
                "-nostdin",
                "-v", "warning",
                "-stats",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list_file),
                "-c", "copy",
                "-map", "0:v",
                "-map", "0:a",
                "-map", "0:s?",
                "-y",
                str(out_p)
            ]
            success = cls._run_ffmpeg_with_progress(
                cmd_fallback, total_duration, on_progress, cancel_check
            )

        if concat_list_file.exists():
            concat_list_file.unlink()

        return success

    @classmethod
    def _run_ffmpeg_with_progress(
        cls,
        cmd: List[str],
        total_duration: float,
        on_progress: Optional[Callable[[float, str], None]],
        cancel_check: Optional[Callable[[], bool]]
    ) -> bool:
        extra_flags = PlatformAdapter.get_subprocess_flags()

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            **extra_flags
        )

        # Regex para capturar o tempo atual do FFmpeg: time=01:23:45.67
        time_pattern = re.compile(r"time=(?P<h>\d+):(?P<m>\d+):(?P<s>\d+(?:\.\d+)?)")

        try:
            while True:
                if cancel_check and cancel_check():
                    proc.kill()
                    return False

                line = proc.stderr.readline() if proc.stderr else ""
                if not line and proc.poll() is not None:
                    break

                if line:
                    m = time_pattern.search(line)
                    if m and total_duration > 0:
                        h = float(m.group("h"))
                        mins = float(m.group("m"))
                        sec = float(m.group("s"))
                        current_sec = h * 3600 + mins * 60 + sec
                        pct = min(99.0, (current_sec / total_duration) * 100.0)
                        if on_progress:
                            on_progress(pct, f"Concatenando: {pct:.1f}% ({int(current_sec)}s / {int(total_duration)}s)")

            ret = proc.wait()
            if ret == 0:
                if on_progress:
                    on_progress(100.0, "Concatenação concluída com sucesso!")
                return True
            return False
        except Exception:
            proc.kill()
            return False
