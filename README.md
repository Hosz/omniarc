# 🎬 OmniArc

**Compilador de Arcos Narrativos e Supercuts de Animes e Séries (Lossless Video Compiler)**

O **OmniArc** é um aplicativo desktop moderno e multiplataforma (**Linux e Windows**) projetado para transformar temporadas e episódios de qualquer anime ou série em filmes contínuos por arco de história, com corte inteligente de aberturas (OP) e encerramentos (ED) sem re-encoding (cópia direta de streams de áudio, vídeo e legendas).

---

## ✨ Principais Funcionalidades

- **Multiplataforma Nativo:** Funciona com a mesma base de código no **Linux** (CachyOS/KDE, Ubuntu, etc.) e no **Windows** (10 e 11).
- **Seleção Livre de Diretórios:** Escolha qualquer pasta de episódios (HD externo, SSD ou rede) e qualquer pasta de destino para salvar os filmes.
- **Detecção Inteligente de Episódios:** Scanner automático compatível com padrões comuns (`S01E01`, `01`, `1x01`, `[Fansub] Nome 01.mkv`).
- **Corte Inteligente de OP/ED:** Detecta aberturas e encerramentos diretamente pelos capítulos do arquivo MKV. Se o episódio não contiver marcações de corte, mantém o arquivo integral com aviso visual na tela.
- **Concatenação 100% Lossless:** Junção instantânea sem perda de qualidade, preservando todas as faixas de áudio (Dual Audio, 5.1, etc.) e legendas embutidas.
- **Interface Minimalista e Zen:** Desenvolvida em PyWebView com tons escuros suaves de ardósia e toques em verde menta pastel, sem sobrecarga de informações.
- **Salvar / Carregar Projetos:** Exporte ou recarregue a estrutura dos seus arcos em arquivos `.json` com um clique.

---

## 🚀 Como Executar

### No Linux (CachyOS / Arch / Ubuntu)

1. Entre na pasta do projeto:
   ```bash
   cd ~/Documentos/Dev/omniarc
   ```

2. Execute o launcher:
   ```bash
   ./run.sh
   ```
   *(Ou execute `python3 main.py` utilizando o ambiente virtual já configurado em `.venv`)*

### No Windows (10 / 11)

1. Instale o Python 3 (versão 3.10 ou superior) marcando a opção *"Add Python to PATH"*.
2. Abra a pasta `omniarc` e dê dois cliques no arquivo:
   ```cmd
   run.bat
   ```
3. *(Opcional)* Se você não tiver o FFmpeg instalado no Windows, basta colocar o `ffmpeg.exe` e `ffprobe.exe` dentro da pasta `bin/` na raiz do projeto. O OmniArc os detectará automaticamente.

---

## 📁 Estrutura do Projeto

```
omniarc/
├── core/                   # Motor Python Multiplataforma
│   ├── platform_adapter.py # Adaptador de SO (isolamento Windows / Linux)
│   ├── models.py           # Modelos de dados (Arcos, Episódios, Capítulos)
│   ├── scanner.py          # Leitura recursiva e parser de episódios
│   ├── chapters.py         # Detecção de tags de OP/ED via ffprobe
│   ├── slicer.py           # Fatiador lossless por episódio
│   ├── concatenator.py     # Concatenação demuxer FFmpeg com progresso
│   ├── validator.py        # Validação de integridade pós-corte
│   ├── pipeline.py         # Orquestrador do fluxo completo
│   └── project_manager.py  # Salvar e carregar arquivos .json
├── api/
│   └── bridge.py           # Ponte de comunicação bidirecional com o frontend
├── ui/                     # Interface Desktop Minimalista (HTML5 / CSS / JS)
│   ├── index.html          # Layout visual limpo
│   ├── css/app.css         # Estilos customizados
│   └── js/app.js           # Gerenciamento de estado, arcos e eventos
├── bin/                    # Pasta opcional para binários portáteis no Windows
├── main.py                 # Ponto de entrada do PyWebView
├── run.sh                  # Inicializador Linux
├── run.bat                 # Inicializador Windows
└── requirements.txt        # Dependências Python
```
