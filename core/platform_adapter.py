"""
platform_adapter.py - Camada de compatibilidade multiplataforma (Linux e Windows)
Isola chamadas de sistema, caminhos e ferramentas externas.
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any


class PlatformAdapter:
    IS_WINDOWS = sys.platform.startswith("win")
    IS_LINUX = sys.platform.startswith("linux")
    IS_MAC = sys.platform == "darwin"

    @classmethod
    def get_app_root(cls) -> Path:
        """Retorna o diretório raiz do aplicativo."""
        if getattr(sys, "frozen", False):
            return Path(sys.executable).parent
        return Path(__file__).resolve().parent.parent

    @classmethod
    def find_tool(cls, tool_name: str) -> Optional[str]:
        """
        Localiza ferramentas como 'ffmpeg', 'ffprobe', 'mkvmerge'.
        1. Procura na pasta local 'bin/' da aplicação (modo portátil para Windows)
        2. Procura no PATH do sistema operacional
        """
        app_root = cls.get_app_root()
        ext = ".exe" if cls.IS_WINDOWS else ""
        candidate_local = app_root / "bin" / f"{tool_name}{ext}"

        if candidate_local.is_file() and os.access(candidate_local, os.X_OK):
            return str(candidate_local)

        # Procura no PATH
        found = shutil.which(f"{tool_name}{ext}") or shutil.which(tool_name)
        if found:
            return found

        return None

    @classmethod
    def get_ffmpeg(cls) -> str:
        tool = cls.find_tool("ffmpeg")
        if not tool:
            raise FileNotFoundError(
                "FFmpeg não foi encontrado. Certifique-se de que está instalado no sistema "
                "ou colocado na pasta 'bin/' do aplicativo."
            )
        return tool

    @classmethod
    def get_ffprobe(cls) -> str:
        tool = cls.find_tool("ffprobe")
        if not tool:
            raise FileNotFoundError(
                "FFprobe não foi encontrado. Certifique-se de que está instalado no sistema "
                "ou colocado na pasta 'bin/' do aplicativo."
            )
        return tool

    @classmethod
    def get_mkvmerge(cls) -> Optional[str]:
        return cls.find_tool("mkvmerge")

    @classmethod
    def get_subprocess_flags(cls) -> Dict[str, Any]:
        """
        Retorna flags adequadas para chamadas de subprocesso.
        No Windows, evita a criação de janelas pretas indesejadas do CMD.
        """
        kwargs: Dict[str, Any] = {}
        if cls.IS_WINDOWS:
            # CREATE_NO_WINDOW = 0x08000000
            kwargs["creationflags"] = 0x08000000
        return kwargs

    @classmethod
    def run_command(cls, cmd: List[str], check: bool = True, **kwargs) -> subprocess.CompletedProcess:
        """Executa um comando de terminal de forma multiplataforma."""
        extra_flags = cls.get_subprocess_flags()
        for k, v in extra_flags.items():
            if k not in kwargs:
                kwargs[k] = v

        return subprocess.run(cmd, check=check, text=True, capture_output=True, **kwargs)

    @classmethod
    def format_ffmpeg_concat_path(cls, path_str: str) -> str:
        """
        Formata o caminho do arquivo para o demuxer 'concat' do FFmpeg.
        Trata aspas simples e normaliza barras no Windows.
        """
        # No FFmpeg concat file:
        # file 'path'
        # Aspas simples no caminho precisam ser escapadas como: '\''
        p = Path(path_str).resolve()
        posix_path = p.as_posix()
        escaped = posix_path.replace("'", "'\\''")
        return f"file '{escaped}'"

    @classmethod
    def probe_file_duration(cls, file_path: str) -> float:
        """Obtém a duração exata de um arquivo de mídia em segundos usando ffprobe."""
        try:
            ffprobe = cls.get_ffprobe()
            cmd = [
                ffprobe,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path
            ]
            res = cls.run_command(cmd, check=False)
            if res.returncode == 0 and res.stdout.strip():
                return float(res.stdout.strip())
        except Exception:
            pass
        return 0.0

    @classmethod
    def format_timestamp_mkvmerge(cls, seconds: float) -> str:
        """Converte segundos float para formato de tempo aceito pelo mkvmerge (HH:MM:SS.mmm)."""
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
    def create_symlink_or_copy(cls, src: str, dst: str):
        """
        Cria link simbólico no Linux (zero I/O) ou copia/link no Windows.
        """
        src_path = Path(src).resolve()
        dst_path = Path(dst).resolve()

        if dst_path.exists() or dst_path.is_symlink():
            dst_path.unlink()

        try:
            os.symlink(src_path, dst_path)
        except (OSError, AttributeError):
            # No Windows sem privilégio de desenvolvedor para symlinks, usa hardlink ou cópia
            try:
                os.link(src_path, dst_path)
            except Exception:
                shutil.copy2(src_path, dst_path)

    @classmethod
    def open_folder_dialog(cls, window=None, title: str = "Selecione uma Pasta") -> Optional[str]:
        """
        Abre o seletor nativo de pastas do sistema operacional.
        Usa pywebview se window estiver disponível, com fallbacks robustos.
        Garante que, se o usuário fechar ou cancelar, NÃO abre outro diálogo em seguida.
        """
        if window is not None:
            try:
                import webview
                result = window.create_file_dialog(
                    webview.FOLDER_DIALOG,
                    allow_multiple=False,
                    directory="",
                    dialog_type=webview.FOLDER_DIALOG
                )
                # Se create_file_dialog foi chamado sem disparar exceção, respeita a escolha
                if result is not None and len(result) > 0:
                    return str(result[0])
                # Usuário cancelou ou fechou a janela: retorna None sem tentar fallbacks
                return None
            except Exception:
                # Apenas se a chamada do webview falhar estruturalmente tenta os fallbacks
                pass

        # Fallback 1: kdialog (KDE Linux)
        if cls.IS_LINUX and shutil.which("kdialog"):
            try:
                res = subprocess.run(
                    ["kdialog", "--getexistingdirectory", ""],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if res.returncode == 0:
                    folder = res.stdout.strip()
                    return folder if folder and os.path.isdir(folder) else None
                # Se o usuário cancelou o kdialog (código de saída != 0), encerra
                return None
            except Exception:
                pass

        # Fallback 2: zenity (GNOME Linux)
        if cls.IS_LINUX and shutil.which("zenity"):
            try:
                res = subprocess.run(
                    ["zenity", "--file-selection", "--directory", f"--title={title}"],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if res.returncode == 0:
                    folder = res.stdout.strip()
                    return folder if folder and os.path.isdir(folder) else None
                return None
            except Exception:
                pass

        # Fallback 3: tkinter (funciona em Windows e Linux)
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            folder = filedialog.askdirectory(title=title)
            root.destroy()
            return folder if folder and os.path.isdir(folder) else None
        except Exception:
            pass

        return None

    @classmethod
    def open_file_dialog(
        cls,
        window=None,
        title: str = "Selecionar Arquivo",
        file_types: tuple = ("Arquivos de Legenda (*.srt;*.ass;*.vtt)", "*.srt;*.ass;*.vtt")
    ) -> Optional[str]:
        """Abre o seletor nativo para escolha de um arquivo individual (ex: legenda)."""
        if window is not None:
            try:
                import webview
                result = window.create_file_dialog(
                    webview.OPEN_DIALOG,
                    allow_multiple=False,
                    file_types=file_types
                )
                if result is not None and len(result) > 0:
                    return str(result[0])
                return None
            except Exception:
                pass

        if cls.IS_LINUX and shutil.which("kdialog"):
            try:
                res = subprocess.run(
                    ["kdialog", "--getopenfilename", "", "*.srt *.ass *.vtt|Legendas (*.srt *.ass *.vtt)"],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if res.returncode == 0:
                    f = res.stdout.strip()
                    return f if f and os.path.isfile(f) else None
                return None
            except Exception:
                pass

        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            f = filedialog.askopenfilename(
                title=title,
                filetypes=[("Legendas", "*.srt *.ass *.vtt"), ("Todos os arquivos", "*.*")]
            )
            root.destroy()
            return f if f and os.path.isfile(f) else None
        except Exception:
            pass

        return None
