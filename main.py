"""
main.py - Ponto de entrada do aplicativo Desktop OmniArc
Inicializa a janela do PyWebView integrada ao motor Python.
"""
import sys
import os
from pathlib import Path

# Garante que a pasta raiz do OmniArc está no sys.path
APP_DIR = Path(__file__).resolve().parent
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import webview
from api import OmniArcBridge


def main():
    bridge = OmniArcBridge()
    html_path = APP_DIR / "ui" / "index.html"

    if not html_path.exists():
        print(f"Erro: Arquivo de interface não encontrado em {html_path}")
        sys.exit(1)

    # Criação da Janela Desktop
    window = webview.create_window(
        title="OmniArc - Compilador de Arcos e Filmes",
        url=str(html_path.resolve()),
        js_api=bridge,
        width=1220,
        height=820,
        min_size=(980, 650),
        background_color="#0f1117"
    )

    # Conecta a janela ao bridge para envio de eventos de progresso
    bridge.set_window(window)

    icon_path = APP_DIR / "assets" / "icon.png"

    def set_app_icon():
        try:
            from PySide6.QtGui import QIcon
            from PySide6.QtWidgets import QApplication
            app = QApplication.instance()
            if app and icon_path.exists():
                app.setWindowIcon(QIcon(str(icon_path)))
        except Exception:
            pass

    # Inicia a aplicação desktop nativa
    # No Linux usa Qt / WebEngine (ou WebKit); no Windows usa WebView2
    webview.start(func=set_app_icon, debug=False)


if __name__ == "__main__":
    main()
