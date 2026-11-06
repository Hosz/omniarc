#!/usr/bin/env python3
"""
fix_all_subtitles.py - Repara cabeçalhos ASS e resolução PlayResX/Y em filmes MKV gerados
"""
import os
import sys
import glob
import subprocess
from pathlib import Path

TARGET_DIRS = [
    "/run/media/hokyozu/New Volume/Jujutsu Kaisen",
    "/run/media/hokyozu/6EE20508E204D5ED/Downloads/Jujutsu Kaisen (Season 1,2,3 + Movie)_Supercuts",
]

def get_target_dir() -> str:
    if len(sys.argv) > 1 and os.path.isdir(sys.argv[1]):
        return sys.argv[1]
    env_dir = os.environ.get("OMNIARC_TARGET_DIR")
    if env_dir and os.path.isdir(env_dir):
        return env_dir
    for d in TARGET_DIRS:
        if os.path.isdir(d):
            return d
    return TARGET_DIRS[0]

def check_and_fix_movie(movie_path: str) -> bool:
    print(f"\n--- Analisando: {os.path.basename(movie_path)} ---")
    
    # 1. Verifica se a legenda já possui PlayResX e PlayResY
    cmd_probe = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-i", movie_path,
        "-map", "0:s:0",
        "-c", "copy",
        "-f", "ass", "-"
    ]
    try:
        proc = subprocess.Popen(cmd_probe, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        header_lines = []
        for _ in range(30):
            line = proc.stdout.readline()
            if not line:
                break
            header_lines.append(line)
        proc.kill()
        proc.wait()
    except Exception as e:
        print(f"Erro ao analisar legendas: {e}")
        return False

    header_text = "".join(header_lines)
    if "playresx" in header_text.lower() and "playresy" in header_text.lower():
        print("  Legenda já possui resolução calibrada (PlayResX/Y). Nenhuma alteração necessária.")
        return True

    print("  BUG DETECTADO: Cabeçalho [Script Info] está vazio ou sem PlayResX/Y!")
    print("  Extraindo trilha de legenda completa...")

    # Extrai a legenda completa
    temp_sub = "/tmp/_tmp_fix_sub.ass"
    temp_sub_fixed = "/tmp/_tmp_fix_sub_fixed.ass"
    temp_mkv = os.path.join(os.path.dirname(movie_path), ".temp_remux_fix.mkv")

    cmd_extract = [
        "ffmpeg", "-nostdin", "-v", "error", "-y",
        "-i", movie_path,
        "-map", "0:s:0",
        "-c", "copy",
        temp_sub
    ]
    subprocess.run(cmd_extract, check=True)

    with open(temp_sub, "r", encoding="utf-8", errors="replace") as f:
        ass_content = f.read()

    full_header = (
        "[Script Info]\n"
        f"Title: {Path(movie_path).stem}\n"
        "ScriptType: v4.00+\n"
        "PlayResX: 1920\n"
        "PlayResY: 1080\n"
        "WrapStyle: 0\n"
        "ScaledBorderAndShadow: yes\n"
        "YCbCr Matrix: TV.709\n\n"
    )

    if "[Script Info]\n" in ass_content:
        # Substitui a seção vazia
        fixed_ass = ass_content.replace("[Script Info]\n", full_header, 1)
    else:
        fixed_ass = full_header + ass_content

    with open(temp_sub_fixed, "w", encoding="utf-8") as f:
        f.write(fixed_ass)

    print("  Remuxando via mkvmerge mantendo vídeo, áudios, anexos de fontes e capítulos intactos...")
    cmd_remux = [
        "mkvmerge", "-o", temp_mkv,
        "--no-subtitles", movie_path,
        "--language", "0:por",
        "--track-name", "0:Português (Brasil)",
        "--default-track-flag", "0:yes",
        temp_sub_fixed
    ]
    res = subprocess.run(cmd_remux, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if res.returncode not in (0, 1):
        print(f"  Falha no remux: {res.stderr.decode()}")
        if os.path.exists(temp_mkv):
            os.remove(temp_mkv)
        return False

    # Substituição atômica
    os.replace(temp_mkv, movie_path)
    print("  Sucesso! Filme atualizado com legendas proporcionais perfeitas.")
    return True

def main():
    target = get_target_dir()
    movies = sorted(glob.glob(f"{target}/*.mkv"))
    if not movies:
        print(f"Nenhum arquivo .mkv encontrado em {target}")
        return

    print(f"Diretório alvo: {target}")
    print(f"Encontrados {len(movies)} filmes para verificação:")
    for m in movies:
        check_and_fix_movie(m)

if __name__ == "__main__":
    main()
