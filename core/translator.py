"""
translator.py - Motor Híbrido de Tradução e Manipulação de Capítulos (PT-BR)
Combina dicionário canônico especializado em Anime/Séries (offline)
com fallback para Google Translate (online sem dependências externas)
e gravação direta no contêiner MKV via mkvpropedit.
"""
import os
import re
import json
import urllib.request
import urllib.parse
from typing import List, Optional, Dict
from .models import ChapterInfo
from .platform_adapter import PlatformAdapter


class ChapterTranslator:
    # Dicionário Canônico Especializado de Termos de Anime e Capítulos
    CANONICAL_DICTIONARY: Dict[str, str] = {
        # Prólogo / Introdução
        "prologue": "Prólogo",
        "prolog": "Prólogo",
        "intro": "Introdução",
        "introduction": "Introdução",
        "cold open": "Cena de Abertura",
        "cold opening": "Cena de Abertura",
        "アバン": "Prólogo",
        "アバンタイトル": "Prólogo",
        "冒頭": "Prólogo",

        # Abertura (OP)
        "opening": "Abertura",
        "opening song": "Abertura",
        "opening theme": "Abertura",
        "op": "Abertura",
        "op theme": "Abertura",
        "オープニング": "Abertura",
        "ノンテロップop": "Abertura (Sem Créditos)",
        "ノンクレジットop": "Abertura (Sem Créditos)",

        # Partes Principais
        "part a": "Parte A",
        "part-a": "Parte A",
        "a part": "Parte A",
        "a-part": "Parte A",
        "part 1": "Parte 1",
        "aパート": "Parte A",
        "前半": "Parte A",

        "part b": "Parte B",
        "part-b": "Parte B",
        "b part": "Parte B",
        "b-part": "Parte B",
        "part 2": "Parte 2",
        "bパート": "Parte B",
        "後半": "Parte B",

        "part c": "Parte C",
        "part-c": "Parte C",
        "c part": "Parte C",
        "c-part": "Parte C",
        "part 3": "Parte 3",
        "cパート": "Parte C",

        # Encerramento (ED)
        "ending": "Encerramento",
        "ending song": "Encerramento",
        "ending theme": "Encerramento",
        "ed": "Encerramento",
        "ed theme": "Encerramento",
        "エンディング": "Encerramento",
        "ノンテロップed": "Encerramento (Sem Créditos)",
        "ノンクレジットed": "Encerramento (Sem Créditos)",

        # Prévias / Trailers
        "preview": "Prévia do Próximo Episódio",
        "next episode preview": "Prévia do Próximo Episódio",
        "next preview": "Prévia do Próximo Episódio",
        "next episode": "Próximo Episódio",
        "trailer": "Prévia",
        "teaser": "Prévia",
        "次回予告": "Prévia do Próximo Episódio",
        "予告": "Prévia",

        # Epílogo / Pós-créditos
        "epilogue": "Epílogo",
        "epilog": "Epílogo",
        "post-credits": "Cena Pós-Créditos",
        "post credits": "Cena Pós-Créditos",
        "after credits": "Cena Pós-Créditos",
        "after the credits": "Cena Pós-Créditos",
        "エピローグ": "Epílogo",

        # Intervalos / Eyecatch
        "eyecatch": "Intervalo (Eyecatch)",
        "eye catch": "Intervalo (Eyecatch)",
        "interlude": "Intervalo",
        "intermission": "Intervalo",
        "break": "Intervalo",
        "アイキャッチ": "Intervalo (Eyecatch)",

        # Especiais e Shorts
        "juju stroll": "Juju Stroll (Passeio Jujutsu)",
        "juju stroll & preview": "Juju Stroll & Prévia",
        "juju sanpo": "Juju Stroll (Passeio Jujutsu)",
        "じゅじゅさんぽ": "Juju Stroll (Passeio Jujutsu)",
        "omake": "Curta Extra (Omake)",
        "extra": "Extra",
        "special": "Especial",

        # Títulos e Créditos
        "title": "Título",
        "title card": "Título do Episódio",
        "subtitle": "Subtítulo",
        "サブタイトル": "Título",
        "credits": "Créditos",
        "staff credits": "Créditos da Equipe",
        "recap": "Recapitulação",
        "summary": "Resumo",
        "ダイジェスト": "Recapitulação",
        "あらすじ": "Recapitulação",
    }

    # Padrões com número (ex: "Chapter 1", "Parte 2", "OP 1")
    PATTERN_RULES = [
        (re.compile(r"^\s*(?:chapter|capitulo|capítulo)\s*(\d+)\s*$", re.IGNORECASE), r"Capítulo \1"),
        (re.compile(r"^\s*(?:part|parte)\s*([a-z0-9]+)\s*$", re.IGNORECASE), r"Parte \1"),
        (re.compile(r"^\s*(?:opening|op)\s*(\d+)\s*$", re.IGNORECASE), r"Abertura \1"),
        (re.compile(r"^\s*(?:ending|ed)\s*(\d+)\s*$", re.IGNORECASE), r"Encerramento \1"),
    ]

    _cache: Dict[str, str] = {}

    @classmethod
    def translate_title(cls, text: str, enable_online: bool = True) -> str:
        """
        Traduz um título de capítulo para PT-BR.
        1. Consulta cache em memória.
        2. Dicionário canônico offline de termos de anime/séries.
        3. Padrões regulares (Chapter X, OP X, Part X).
        4. Fallback online (Google Translate via urllib) se habilitado.
        """
        if not text or not text.strip():
            return "Segmento"

        clean = text.strip()
        lower = clean.lower()

        # 1. Cache
        if clean in cls._cache:
            return cls._cache[clean]

        # 2. Dicionário canônico direto
        if lower in cls.CANONICAL_DICTIONARY:
            translated = cls.CANONICAL_DICTIONARY[lower]
            cls._cache[clean] = translated
            return translated

        # 3. Padrões de substituição com regex
        for pattern, replacement in cls.PATTERN_RULES:
            if pattern.search(clean):
                translated = pattern.sub(replacement, clean)
                cls._cache[clean] = translated
                return translated

        # 4. Fallback online se permitido e contiver texto descritivo
        if enable_online:
            try:
                online_trans = cls._google_translate_online(clean)
                if online_trans and online_trans.lower() != lower:
                    # Capitaliza a primeira letra para manter elegância
                    formatted = online_trans[0].upper() + online_trans[1:] if len(online_trans) > 1 else online_trans.upper()
                    cls._cache[clean] = formatted
                    return formatted
            except Exception:
                pass

        # Mantém original se nada encontrou
        cls._cache[clean] = clean
        return clean

    @classmethod
    def _google_translate_online(cls, text: str) -> Optional[str]:
        """Consulta leve e sem dependências ao endpoint público do Google Translate."""
        quoted = urllib.parse.quote(text)
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q={quoted}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and data[0]:
                return "".join([part[0] for part in data[0] if part and part[0]]).strip()
        return None

    @classmethod
    def translate_chapters(cls, chapters: List[ChapterInfo], enable_online: bool = True) -> List[ChapterInfo]:
        """Aplica a tradução a uma lista de ChapterInfo, atualizando title_pt."""
        translated_list: List[ChapterInfo] = []
        for chap in chapters:
            pt = cls.translate_title(chap.title, enable_online=enable_online)
            chap.title_pt = pt
            translated_list.append(chap)
        return translated_list

    @classmethod
    def format_ogm_chapters(cls, chapters: List[ChapterInfo], use_pt: bool = True) -> str:
        """Gera o texto de capítulos no formato simples OGM compatível com mkvpropedit/mkvmerge."""
        lines = []
        for idx, c in enumerate(chapters, 1):
            ts = PlatformAdapter.format_timestamp_mkvmerge(c.start_time)
            title = (c.title_pt if use_pt and c.title_pt else c.title) or f"Capítulo {idx}"
            lines.append(f"CHAPTER{idx:02d}={ts}")
            lines.append(f"CHAPTER{idx:02d}NAME={title}")
        return "\n".join(lines) + "\n"

    @classmethod
    def apply_chapters_to_mkv(cls, file_path: str, chapters: List[ChapterInfo], use_pt: bool = True) -> bool:
        """
        Grava os capítulos traduzidos diretamente no contêiner MKV usando mkvpropedit.
        Execução ultra-rápida (in-place) sem re-encode ou remux do vídeo.
        """
        if not os.path.isfile(file_path):
            return False

        mkvpropedit = PlatformAdapter.find_tool("mkvpropedit")
        if not mkvpropedit:
            return False

        ch_text = cls.format_ogm_chapters(chapters, use_pt=use_pt)
        temp_ch_file = os.path.join(os.path.dirname(file_path), f".temp_chapters_{os.path.basename(file_path)}.txt")

        try:
            with open(temp_ch_file, "w", encoding="utf-8") as f:
                f.write(ch_text)

            cmd = [
                mkvpropedit,
                file_path,
                "--chapters", temp_ch_file
            ]
            res = PlatformAdapter.run_command(cmd, check=False)
            return res.returncode == 0
        finally:
            if os.path.exists(temp_ch_file):
                try:
                    os.remove(temp_ch_file)
                except Exception:
                    pass
