"""
bridge.py - Ponte de comunicação entre a Interface Web (PyWebView) e o Motor Python
"""
import os
import json
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List
from core import (
    PlatformAdapter,
    EpisodeScanner,
    ProjectManager,
    BuildPipeline,
    ArcBlock,
    ProjectConfig,
    EpisodeInfo
)


class OmniArcBridge:
    def __init__(self):
        self._window = None
        self._pipeline = BuildPipeline()
        self._is_building = False
        self._episodes_cache: Dict[str, EpisodeInfo] = {}

    def set_window(self, window):
        self._window = window

    def _eval_js(self, js_code: str):
        """Executa JavaScript com segurança no contexto da janela."""
        if self._window:
            try:
                self._window.evaluate_js(js_code)
            except Exception:
                pass

    def emit_progress(self, data: Dict[str, Any]):
        """Envia atualização de progresso para a interface."""
        payload = json.dumps(data, ensure_ascii=False)
        self._eval_js(f"window.onProgressUpdate && window.onProgressUpdate({payload});")

    def emit_log(self, message: str, level: str = "info"):
        """Envia mensagem de log para o console visual da interface."""
        payload = json.dumps({"message": message, "level": level}, ensure_ascii=False)
        self._eval_js(f"window.onLogMessage && window.onLogMessage({payload});")

    # =========================================================================
    # Métodos Invocáveis pelo Frontend via pywebview.api
    # =========================================================================

    def get_system_info(self) -> Dict[str, Any]:
        """Retorna informações do sistema e status das ferramentas."""
        try:
            ffmpeg_p = PlatformAdapter.get_ffmpeg()
            ffprobe_p = PlatformAdapter.get_ffprobe()
            mkvmerge_p = PlatformAdapter.get_mkvmerge()
            return {
                "os": "Windows" if PlatformAdapter.IS_WINDOWS else "Linux",
                "ffmpeg_found": True,
                "ffmpeg_path": ffmpeg_p,
                "ffprobe_path": ffprobe_p,
                "mkvmerge_path": mkvmerge_p or "Não instalado (opcional)",
            }
        except Exception as e:
            return {
                "os": "Windows" if PlatformAdapter.IS_WINDOWS else "Linux",
                "ffmpeg_found": False,
                "error": str(e)
            }

    def select_source_folder(self) -> Dict[str, Any]:
        """Abre o seletor nativo e varre automaticamente os episódios se selecionado."""
        folder = PlatformAdapter.open_folder_dialog(self._window, title="Selecionar Pasta dos Episódios")
        if not folder:
            return {"cancelled": True}

        # Realiza a varredura
        episodes = EpisodeScanner.scan_directory(folder)
        self._episodes_cache = {ep.file_path: ep for ep in episodes}

        return {
            "cancelled": False,
            "folder": folder,
            "episodes": [ep.to_dict() for ep in episodes],
            "total": len(episodes)
        }

    def select_output_folder(self) -> Dict[str, Any]:
        """Abre o seletor nativo para a pasta de destino dos filmes."""
        folder = PlatformAdapter.open_folder_dialog(self._window, title="Selecionar Pasta de Destino dos Filmes")
        if not folder:
            return {"cancelled": True}
        return {"cancelled": False, "folder": folder}

    def scan_episodes(self, source_dir: str) -> Dict[str, Any]:
        """Varre novamente uma pasta já configurada."""
        if not source_dir or not os.path.isdir(source_dir):
            return {"success": False, "error": "Diretório inválido"}

        episodes = EpisodeScanner.scan_directory(source_dir)
        self._episodes_cache = {ep.file_path: ep for ep in episodes}
        return {
            "success": True,
            "episodes": [ep.to_dict() for ep in episodes],
            "total": len(episodes)
        }

    def save_project(self, project_data: Dict[str, Any], filepath: Optional[str] = None) -> Dict[str, Any]:
        """Salva a configuração do projeto atual em arquivo JSON."""
        try:
            arcs = []
            for a in project_data.get("arcs", []):
                arcs.append(ArcBlock(
                    arc_id=int(a.get("arc_id", 1)),
                    code=a.get("code", "Bloco_01"),
                    title=a.get("title", "Novo Filme"),
                    output_filename=a.get("output_filename", "Filme_01.mkv"),
                    episode_paths=a.get("episode_paths", []),
                    strip_op_ed=bool(a.get("strip_op_ed", True)),
                    estimated_duration=a.get("estimated_duration", "00h 00m")
                ))

            config = ProjectConfig(
                project_name=project_data.get("project_name", "Projeto"),
                source_dir=project_data.get("source_dir", ""),
                output_dir=project_data.get("output_dir", ""),
                temp_dir=project_data.get("temp_dir", ""),
                clean_temp_on_finish=bool(project_data.get("clean_temp_on_finish", True)),
                arcs=arcs
            )

            if not filepath:
                # Salva por padrão na pasta de saída ou na pasta de origem
                target_dir = config.output_dir or config.source_dir or str(PlatformAdapter.get_app_root())
                safe_name = "".join(c for c in config.project_name if c.isalnum() or c in (" ", "_", "-")).strip()
                safe_name = safe_name.replace(" ", "_").lower() or "projeto"
                filepath = os.path.join(target_dir, f"{safe_name}.omniarc.json")

            ok = ProjectManager.save_project(config, filepath)
            return {"success": ok, "file_path": filepath}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def load_project(self, filepath: Optional[str] = None) -> Dict[str, Any]:
        """Carrega um arquivo de projeto JSON."""
        if not filepath:
            # Diálogo para abrir arquivo
            if self._window:
                import webview
                res = self._window.create_file_dialog(
                    webview.OPEN_DIALOG,
                    allow_multiple=False,
                    file_types=("Projetos OmniArc (*.json)", "Todos os Arquivos (*.*)")
                )
                if res and len(res) > 0:
                    filepath = str(res[0])
            if not filepath:
                return {"cancelled": True}

        config = ProjectManager.load_project(filepath)
        if not config:
            return {"success": False, "error": "Não foi possível carregar o arquivo do projeto."}

        # Se houver source_dir, já recarrega os episódios para sincronizar
        episodes_data = []
        if config.source_dir and os.path.isdir(config.source_dir):
            episodes = EpisodeScanner.scan_directory(config.source_dir)
            self._episodes_cache = {ep.file_path: ep for ep in episodes}
            episodes_data = [ep.to_dict() for ep in episodes]

        return {
            "success": True,
            "config": config.to_dict(),
            "file_path": filepath,
            "episodes": episodes_data
        }

    def build_arc(self, arc_data: Dict[str, Any], project_data: Dict[str, Any]) -> Dict[str, Any]:
        """Inicia a construção de um arco em segundo plano."""
        if self._is_building:
            return {"success": False, "error": "Já existe um processamento em andamento."}

        arc = ArcBlock(
            arc_id=int(arc_data.get("arc_id", 1)),
            code=arc_data.get("code", "Bloco_01"),
            title=arc_data.get("title", "Novo Filme"),
            output_filename=arc_data.get("output_filename", "Filme_01.mkv"),
            episode_paths=arc_data.get("episode_paths", []),
            strip_op_ed=bool(arc_data.get("strip_op_ed", True)),
            estimated_duration=arc_data.get("estimated_duration", "00h 00m")
        )

        output_dir = project_data.get("output_dir") or arc_data.get("output_dir", "")
        if not output_dir:
            return {"success": False, "error": "Pasta de destino não configurada!"}

        temp_dir = project_data.get("temp_dir") or os.path.join(output_dir, ".omniarc_temp")
        clean_temp = bool(project_data.get("clean_temp_on_finish", True))

        self._is_building = True

        def worker():
            try:
                res = self._pipeline.build_arc(
                    arc=arc,
                    episodes_map=self._episodes_cache,
                    output_dir=output_dir,
                    temp_dir=temp_dir,
                    clean_temp=clean_temp,
                    on_progress=self.emit_progress
                )
                payload = json.dumps(res, ensure_ascii=False)
                self._eval_js(f"window.onBuildFinished && window.onBuildFinished({payload});")
            except Exception as e:
                err_payload = json.dumps({"success": False, "error": str(e)}, ensure_ascii=False)
                self._eval_js(f"window.onBuildFinished && window.onBuildFinished({err_payload});")
            finally:
                self._is_building = False

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

        return {"success": True, "started": True}

    def cancel_build(self) -> Dict[str, Any]:
        """Cancela o processo atual."""
        if self._is_building:
            self._pipeline.cancel()
            self.emit_log("Cancelamento solicitado...", level="warning")
            return {"success": True}
        return {"success": False, "message": "Nenhum processo em execução."}
