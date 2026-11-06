#!/usr/bin/env python3
"""
translate_chapters.py - Script CLI para Inspeção e Tradução de Capítulos de Arquivos MKV
Varre episódios/vídeos, traduz títulos de capítulos de qualquer idioma para Português (PT-BR)
utilizando motor híbrido (Dicionário Anime + Google Translate) e opcionalmente
grava as alterações nos arquivos com mkvpropedit sem re-encode.
"""
import os
import sys
import glob
import argparse
from pathlib import Path

# Adiciona a raiz do projeto ao sys.path para importar core
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.platform_adapter import PlatformAdapter
from core.chapters import ChapterAnalyzer
from core.translator import ChapterTranslator


def format_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def process_file(file_path: str, apply_changes: bool = False, enable_online: bool = True) -> bool:
    print(f"\n{'='*75}")
    print(f"🎬 Arquivo: {os.path.basename(file_path)}")
    print(f"{'='*75}")

    chapters = ChapterAnalyzer.probe_chapters(file_path)
    if not chapters:
        print("  ⚠️ Nenhum capítulo detectado neste arquivo.")
        return False

    print(f"  Encontrados {len(chapters)} capítulos:")
    print(f"  {'#':<3} | {'Início':<8} → {'Fim':<8} | {'Duração':<7} | {'Título Original':<22} → {'Tradução (PT-BR)'}")
    print(f"  {'-'*3}-+-{'-'*8}---{'-'*8}-+-{'-'*7}-+-{'-'*22}---{'-'*25}")

    # Traduz os capítulos
    translated_chapters = ChapterTranslator.translate_chapters(chapters, enable_online=enable_online)

    has_diff = False
    for idx, c in enumerate(translated_chapters, 1):
        dur_s = max(0.0, c.end_time - c.start_time)
        t_orig = c.title
        t_pt = c.title_pt or t_orig
        if t_orig != t_pt:
            has_diff = True
        print(f"  {idx:<3} | {format_time(c.start_time):<8} → {format_time(c.end_time):<8} | {dur_s:>5.1f}s | {t_orig:<22} → \033[1;32m{t_pt}\033[0m")

    if apply_changes:
        mkvpropedit = PlatformAdapter.find_tool("mkvpropedit")
        if not mkvpropedit:
            print("\n  ❌ mkvpropedit não encontrado no sistema. Não foi possível gravar.")
            return False

        print("\n  💾 Gravando novos capítulos no arquivo via mkvpropedit...")
        ok = ChapterTranslator.apply_chapters_to_mkv(file_path, translated_chapters, use_pt=True)
        if ok:
            print("  ✅ Sucesso: Capítulos atualizados permanentemente no contêiner MKV!")
            return True
        else:
            print("  ❌ Erro ao executar mkvpropedit.")
            return False
    else:
        print("\n  ℹ️ Modo visualização (Dry-run). Use --apply para salvar as alterações no arquivo.")
        return True


def main():
    parser = argparse.ArgumentParser(description="Tradutor de Capítulos Matroska (MKV) para PT-BR")
    parser.add_argument("path", help="Caminho para arquivo .mkv ou diretório com episódios")
    parser.add_argument("--apply", action="store_true", help="Grava as alterações diretamente nos arquivos MKV via mkvpropedit")
    parser.add_argument("--offline", action="store_true", help="Desabilita consulta online ao Google Translate (apenas dicionário de anime)")
    args = parser.parse_args()

    target = Path(args.path).resolve()
    if not target.exists():
        print(f"Erro: Caminho não encontrado: {target}")
        sys.exit(1)

    enable_online = not args.offline

    if target.is_file():
        if target.suffix.lower() != ".mkv":
            print("Erro: O arquivo alvo precisa ser um contêiner .mkv")
            sys.exit(1)
        process_file(str(target), apply_changes=args.apply, enable_online=enable_online)
    else:
        mkv_files = sorted(glob.glob(f"{target}/**/*.mkv", recursive=True))
        if not mkv_files:
            print(f"Nenhum arquivo .mkv encontrado em {target}")
            sys.exit(0)

        print(f"Encontrados {len(mkv_files)} arquivos MKV para processamento:")
        count_success = 0
        for f in mkv_files:
            if process_file(f, apply_changes=args.apply, enable_online=enable_online):
                count_success += 1

        print(f"\n🎉 Concluído: {count_success}/{len(mkv_files)} arquivos processados.")


if __name__ == "__main__":
    main()
