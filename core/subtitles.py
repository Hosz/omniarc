"""
subtitles.py - Processador e Unificador Inteligente de Legendas e Capítulos
Garante ordenação cronológica estrita, sincronização após corte de OP/ED
e multiplexação correta no contêiner Matroska (MKV).
"""
import os
import re
import subprocess
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
from .models import EpisodeInfo
from .platform_adapter import PlatformAdapter


class SubtitleProcessor:
    @staticmethod
    def parse_ass_time(ts_str: str) -> float:
        """Converte timestamp ASS (H:MM:SS.cs) para segundos float."""
        try:
            parts = ts_str.strip().split(":")
            h = int(parts[0])
            m = int(parts[1])
            s_parts = parts[2].split(".")
            s = int(s_parts[0])
            cs = int(s_parts[1]) if len(s_parts) > 1 else 0
            # Se for centissegundos (2 dígitos) ou milissegundos (3 dígitos)
            frac = cs / (100.0 if len(s_parts[1]) <= 2 else 1000.0)
            return h * 3600.0 + m * 60.0 + s + frac
        except Exception:
            return 0.0

    @staticmethod
    def format_ass_time(seconds: float) -> str:
        """Converte segundos float para timestamp ASS (H:MM:SS.cs)."""
        if seconds < 0:
            seconds = 0.0
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        cs = int(round((seconds - int(seconds)) * 100))
        if cs >= 100:
            cs = 0
            s += 1
        if s >= 60:
            s = 0
            m += 1
        if m >= 60:
            m = 0
            h += 1
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    @staticmethod
    def format_chapter_time(seconds: float) -> str:
        """Converte segundos float para formato de capítulos MKV (HH:MM:SS.mmm)."""
        if seconds < 0:
            seconds = 0.0
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int(round((seconds - int(seconds)) * 1000))
        if ms >= 1000:
            ms = 0
            s += 1
        if s >= 60:
            s = 0
            m += 1
        if m >= 60:
            m = 0
            h += 1
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

    @classmethod
    def build_unified_ass(
        cls,
        episodes_data: List[Tuple[EpisodeInfo, List[Tuple[float, float, str]], float]],
        output_ass_path: str
    ) -> bool:
        """
        Unifica as legendas externas (ou extraídas) de múltiplos episódios em um único arquivo .ass:
        - Ajusta o tempo de cada fala para o tempo contínuo do filme.
        - Descarta falas contidas em trechos cortados (aberturas e encerramentos removidos).
        - Mescla estilos de todos os episódios sem duplicações.
        - Ordena todas as falas rigorosamente em ordem cronológica de início.
        """
        merged_events: List[Tuple[float, str]] = []
        current_movie_time = 0.0
        script_info_lines: List[str] = []
        has_captured_script_info = False
        styles_map: Dict[str, str] = {}
        styles_format_line: str = "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        events_format_line: str = "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"

        has_any_sub = False

        for ep, intervals, cut_duration in episodes_data:
            sub_file = ep.external_sub_path
            extracted_temp_to_clean = None
            if not sub_file or not os.path.isfile(sub_file):
                # Fallback: tenta extrair faixa de legenda embutida do arquivo de vídeo original
                if ep.file_path and os.path.isfile(ep.file_path):
                    temp_extracted = Path(output_ass_path).parent / f"_extracted_{Path(ep.file_path).stem}.ass"
                    cmd_extract = [
                        PlatformAdapter.get_ffmpeg(),
                        "-nostdin", "-v", "error", "-y",
                        "-i", ep.file_path,
                        "-map", "0:s:0",
                        "-c", "copy",
                        str(temp_extracted)
                    ]
                    res_ext = PlatformAdapter.run_command(cmd_extract, check=False)
                    if res_ext.returncode == 0 and temp_extracted.is_file() and temp_extracted.stat().st_size > 100:
                        sub_file = str(temp_extracted)
                        extracted_temp_to_clean = temp_extracted

            if not sub_file or not os.path.isfile(sub_file):
                # Se não há legenda para este episódio, apenas avança o tempo do filme
                current_movie_time += cut_duration
                continue

            has_any_sub = True

            try:
                with open(sub_file, "r", encoding="utf-8-sig", errors="replace") as f:
                    lines = f.readlines()
            except Exception:
                with open(sub_file, "r", encoding="latin-1", errors="replace") as f:
                    lines = f.readlines()
            finally:
                if extracted_temp_to_clean and extracted_temp_to_clean.exists():
                    try:
                        extracted_temp_to_clean.unlink()
                    except Exception:
                        pass

            # Processamento de Seções ASS
            in_info = False
            in_styles = False
            in_events = False

            delay = (ep.external_sub_delay_ms or 0) / 1000.0

            # Mapeamento dos intervalos mantidos no episódio cortado
            interval_offsets = []
            acc = 0.0
            for s, e, _ in intervals:
                dur = e - s
                interval_offsets.append((s, e, acc))
                acc += dur

            for line in lines:
                stripped = line.strip()
                if stripped == "[Script Info]":
                    in_info = True
                    in_styles = False
                    in_events = False
                    if not has_captured_script_info:
                        script_info_lines.append(line)
                    continue
                elif stripped == "[V4+ Styles]" or stripped == "[V4 Styles]":
                    if in_info and script_info_lines:
                        has_captured_script_info = True
                    in_styles = True
                    in_info = False
                    in_events = False
                    continue
                elif stripped == "[Events]":
                    if in_info and script_info_lines:
                        has_captured_script_info = True
                    in_events = True
                    in_info = False
                    in_styles = False
                    continue
                elif stripped.startswith("["):
                    if in_info and script_info_lines:
                        has_captured_script_info = True
                    in_info = False
                    in_styles = False
                    in_events = False
                    continue

                if in_info and not has_captured_script_info:
                    script_info_lines.append(line)

                elif in_styles:
                    if line.startswith("Format:"):
                        styles_format_line = line
                    elif line.startswith("Style:"):
                        parts = line.split(",", 2)
                        if len(parts) >= 2:
                            style_name = parts[1].strip()
                            if style_name not in styles_map:
                                styles_map[style_name] = line

                elif in_events:
                    if line.startswith("Format:"):
                        events_format_line = line
                        continue
                    if not (line.startswith("Dialogue:") or line.startswith("Comment:")):
                        continue

                    parts = line.split(",", 9)
                    if len(parts) < 10:
                        continue

                    ev_type = "Dialogue:" if line.startswith("Dialogue:") else "Comment:"
                    orig_start = cls.parse_ass_time(parts[1]) - delay
                    orig_end = cls.parse_ass_time(parts[2]) - delay

                    # Verifica se o evento está dentro de algum intervalo mantido
                    matched_offset = None
                    if not intervals or len(intervals) <= 1:
                        # Episódio sem cortes
                        matched_offset = (0.0, 0.0)
                    else:
                        for s_int, e_int, off_int in interval_offsets:
                            if orig_start >= s_int - 0.5 and orig_end <= e_int + 0.5:
                                matched_offset = (s_int, off_int)
                                break
                            if not (orig_end < s_int or orig_start > e_int):
                                matched_offset = (s_int, off_int)
                                break

                    if matched_offset is None:
                        # Linha descartada pois pertencia à abertura ou encerramento cortados
                        continue

                    s_int, off_int = matched_offset
                    rel_start = off_int + max(0.0, orig_start - s_int)
                    rel_end = off_int + max(0.0, orig_end - s_int)

                    movie_start = current_movie_time + rel_start
                    movie_end = current_movie_time + rel_end

                    parts[1] = cls.format_ass_time(movie_start)
                    parts[2] = cls.format_ass_time(movie_end)

                    new_line = ev_type + ",".join(parts)[len(ev_type):]
                    merged_events.append((movie_start, new_line))

            current_movie_time += cut_duration

        if not has_any_sub or not merged_events:
            return False

        # Ordenação cronológica estrita por timestamp de início
        merged_events.sort(key=lambda x: x[0])

        out_p = Path(output_ass_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)

        # Garante integridade do bloco [Script Info] com resolução PlayResX/Y
        playres_x = False
        playres_y = False
        scaled_shadow = False
        script_type = False

        cleaned_info: List[str] = []
        if script_info_lines:
            for l in script_info_lines:
                cleaned_info.append(l if l.endswith("\n") else f"{l}\n")
                low = l.strip().lower()
                if low.startswith("playresx:"):
                    playres_x = True
                elif low.startswith("playresy:"):
                    playres_y = True
                elif low.startswith("scaledborderandshadow:"):
                    scaled_shadow = True
                elif low.startswith("scripttype:"):
                    script_type = True

        if not cleaned_info:
            cleaned_info = [
                "[Script Info]\n",
                "Title: OmniArc Supercut Subtitles\n",
                "ScriptType: v4.00+\n",
                "PlayResX: 1920\n",
                "PlayResY: 1080\n",
                "WrapStyle: 0\n",
                "ScaledBorderAndShadow: yes\n",
                "YCbCr Matrix: TV.709\n",
            ]
        else:
            if not script_type:
                cleaned_info.append("ScriptType: v4.00+\n")
            if not playres_x:
                cleaned_info.append("PlayResX: 1920\n")
            if not playres_y:
                cleaned_info.append("PlayResY: 1080\n")
            if not scaled_shadow:
                cleaned_info.append("ScaledBorderAndShadow: yes\n")

        with open(out_p, "w", encoding="utf-8") as f:
            f.writelines(cleaned_info)
            if not cleaned_info[-1].endswith("\n"):
                f.write("\n")
            f.write("\n")

            f.write("[V4+ Styles]\n")
            f.write(styles_format_line)
            for style_line in styles_map.values():
                f.write(style_line if style_line.endswith("\n") else f"{style_line}\n")
            f.write("\n")

            f.write("[Events]\n")
            f.write(events_format_line)
            for _, ev_line in merged_events:
                f.write(ev_line if ev_line.endswith("\n") else f"{ev_line}\n")

        return True

    @classmethod
    def generate_chapters_file(
        cls,
        episodes_data: List[Any],
        output_chapters_path: str,
        detailed: bool = True,
        strip_op_ed: bool = True,
        keep_first_op: bool = True,
        keep_last_ed: bool = True
    ) -> bool:
        """
        Gera arquivo de capítulos Matroska simples para navegação no reprodutor.
        Suporta modo detalhado (preserva partes internas como Parte A, Parte B, etc.,
        com tempos contínuos do filme e títulos traduzidos) ou modo resumido (1 por episódio).
        """
        out_p = Path(output_chapters_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)

        current_time = 0.0
        lines = []
        chap_num = 1
        total_eps = len(episodes_data)

        for idx, item in enumerate(episodes_data):
            if len(item) == 3:
                ep, intervals, duration = item
            else:
                ep, duration = item
                intervals = None

            is_first_ep = (idx == 0)
            is_last_ep = (idx == total_eps - 1)
            keep_op_for_this = bool(keep_first_op and is_first_ep)
            keep_ed_for_this = bool(keep_last_ed and is_last_ep)

            # Se detalhado e o episódio possui capítulos detectados
            if detailed and ep.chapters:
                has_custom = any(not c.kept for c in ep.chapters)
                if has_custom:
                    kept_chaps = [c for c in ep.chapters if c.kept]
                elif strip_op_ed:
                    kept_chaps = [
                        c for c in ep.chapters
                        if not ((c.is_op and not keep_op_for_this) or (c.is_ed and not keep_ed_for_this))
                    ]
                else:
                    kept_chaps = list(ep.chapters)

                if kept_chaps:
                    rel_accum = 0.0
                    for c in kept_chaps:
                        raw_ts = current_time + rel_accum
                        if chap_num == 1 and raw_ts < 1.0:
                            ts_str = "00:00:00.000"
                        else:
                            ts_str = cls.format_chapter_time(raw_ts)

                        raw_title = c.title_pt or c.title
                        if not c.title_pt:
                            from .translator import ChapterTranslator
                            raw_title = ChapterTranslator.translate_title(c.title)

                        name = f"{ep.display_code}: {raw_title}"
                        lines.append(f"CHAPTER{chap_num:02d}={ts_str}\n")
                        lines.append(f"CHAPTER{chap_num:02d}NAME={name}\n")
                        chap_num += 1
                        rel_accum += c.duration_seconds

                    current_time += duration
                    continue

            # Fallback (ou não detalhado, ou episódio sem capítulos): 1 capítulo por episódio
            if chap_num == 1 and current_time < 1.0:
                ts_str = "00:00:00.000"
            else:
                ts_str = cls.format_chapter_time(current_time)

            title = ep.title or f"Episódio {ep.episode_num}"
            name = f"{ep.display_code} - {title}"

            lines.append(f"CHAPTER{chap_num:02d}={ts_str}\n")
            lines.append(f"CHAPTER{chap_num:02d}NAME={name}\n")
            chap_num += 1
            current_time += duration

        with open(out_p, "w", encoding="utf-8") as f:
            f.writelines(lines)

        return True

    @classmethod
    def mux_final_movie(
        cls,
        video_audio_file: str,
        output_movie_path: str,
        sub_ass_path: Optional[str] = None,
        chapters_path: Optional[str] = None,
        font_source_path: Optional[str] = None
    ) -> bool:
        """
        Muxa o vídeo/áudio concatenado com a legenda unificada, capítulos e fontes anexas.
        Prioriza mkvmerge (rápido e 100% em conformidade com Matroska).
        Fallback para ffmpeg se mkvmerge não estiver disponível.
        """
        out_p = Path(output_movie_path).resolve()
        out_p.parent.mkdir(parents=True, exist_ok=True)

        mkvmerge = PlatformAdapter.get_mkvmerge()
        if mkvmerge:
            cmd = [
                mkvmerge,
                "-o", str(out_p),
                "--no-subtitles",
                video_audio_file
            ]

            if chapters_path and os.path.isfile(chapters_path):
                cmd.extend(["--chapters", chapters_path])

            if sub_ass_path and os.path.isfile(sub_ass_path):
                cmd.extend([
                    "--language", "0:por",
                    "--track-name", "0:Português (Brasil)",
                    "--default-track-flag", "0:yes",
                    sub_ass_path
                ])

            if font_source_path and os.path.isfile(font_source_path):
                # Anexa apenas fontes de estilo do arquivo de origem
                cmd.extend([
                    "--no-video",
                    "--no-audio",
                    "--no-subtitles",
                    font_source_path
                ])

            res = PlatformAdapter.run_command(cmd, check=False)
            # mkvmerge: returncode 0 = sucesso, 1 = avisos (sucesso com warnings)
            return res.returncode in (0, 1)

        # Fallback FFmpeg
        ffmpeg = PlatformAdapter.get_ffmpeg()
        cmd = [
            ffmpeg,
            "-nostdin",
            "-v", "warning",
            "-i", video_audio_file
        ]

        if sub_ass_path and os.path.isfile(sub_ass_path):
            cmd.extend([
                "-i", sub_ass_path,
                "-c", "copy",
                "-map", "0:v",
                "-map", "0:a",
                "-map", "1:s",
                "-metadata:s:s:0", "language=por",
                "-metadata:s:s:0", "title=Português (Brasil)",
                "-disposition:s:0", "default"
            ])
        else:
            cmd.extend([
                "-c", "copy",
                "-map", "0:v",
                "-map", "0:a"
            ])

        cmd.extend(["-y", str(out_p)])
        res = PlatformAdapter.run_command(cmd, check=False)
        return res.returncode == 0
