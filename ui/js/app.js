/**
 * app.js - Lógica interativa da interface OmniArc
 * Suporte completo a Modo Claro / Escuro e Paletas de Cores Customizáveis
 */

// Paletas de Cores Disponíveis
const COLOR_PALETTES = {
  mint: {
    name: "Menta Suave",
    accent: "#6ee7b7",
    dark: "#34d399",
    wash: "rgba(110, 231, 183, 0.12)",
    border: "rgba(110, 231, 183, 0.3)",
    text: "#0f172a"
  },
  blue: {
    name: "Azul Oceano",
    accent: "#60a5fa",
    dark: "#3b82f6",
    wash: "rgba(96, 165, 250, 0.12)",
    border: "rgba(96, 165, 250, 0.3)",
    text: "#ffffff"
  },
  lavender: {
    name: "Lavanda",
    accent: "#a78bfa",
    dark: "#8b5cf6",
    wash: "rgba(167, 139, 250, 0.12)",
    border: "rgba(167, 139, 250, 0.3)",
    text: "#ffffff"
  },
  peach: {
    name: "Pêssego",
    accent: "#fb923c",
    dark: "#f97316",
    wash: "rgba(251, 146, 60, 0.12)",
    border: "rgba(251, 146, 60, 0.3)",
    text: "#0f172a"
  },
  sakura: {
    name: "Rosa Sakura",
    accent: "#f472b6",
    dark: "#ec4899",
    wash: "rgba(244, 114, 182, 0.12)",
    border: "rgba(244, 114, 182, 0.3)",
    text: "#ffffff"
  },
  emerald: {
    name: "Esmeralda",
    accent: "#10b981",
    dark: "#059669",
    wash: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.3)",
    text: "#ffffff"
  }
};

// Estado Global da Aplicação
const state = {
  projectName: "Projeto Anime",
  sourceDir: "",
  outputDir: "",
  episodes: [],
  filteredEpisodes: [],
  arcs: [],
  activeArcIdForRange: null,
  activeEpisodeForSub: null,
  tempSubPath: null,
  isProcessing: false,
  isDarkMode: true,
  currentAccent: "mint"
};

// =============================================================================
// Inicialização
// =============================================================================

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupEventListeners();
  checkSystemInfo();
});

function initTheme() {
  // 1. Modo Escuro / Claro
  const savedMode = localStorage.getItem("omniarc_theme_mode");
  if (savedMode === "light") {
    state.isDarkMode = false;
    document.documentElement.classList.remove("dark");
  } else {
    state.isDarkMode = true;
    document.documentElement.classList.add("dark");
  }
  updateThemeIcons();

  // 2. Cor de Destaque
  const savedAccent = localStorage.getItem("omniarc_accent_color") || "mint";
  setAccentColor(savedAccent);
}

function updateThemeIcons() {
  const sunIcon = document.getElementById("icon-sun");
  const moonIcon = document.getElementById("icon-moon");
  if (state.isDarkMode) {
    sunIcon.classList.add("hidden");
    moonIcon.classList.remove("hidden");
  } else {
    sunIcon.classList.remove("hidden");
    moonIcon.classList.add("hidden");
  }
}

function toggleDarkMode() {
  state.isDarkMode = !state.isDarkMode;
  if (state.isDarkMode) {
    document.documentElement.classList.add("dark");
    localStorage.setItem("omniarc_theme_mode", "dark");
  } else {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("omniarc_theme_mode", "light");
  }
  updateThemeIcons();
}

function setAccentColor(colorKey) {
  const palette = COLOR_PALETTES[colorKey] || COLOR_PALETTES.mint;
  state.currentAccent = colorKey;

  const root = document.documentElement;
  root.style.setProperty("--color-accent", palette.accent);
  root.style.setProperty("--color-accent-dark", palette.dark);
  root.style.setProperty("--color-accent-wash", palette.wash);
  root.style.setProperty("--color-accent-border", palette.border);
  root.style.setProperty("--color-accent-text", palette.text);

  // Atualiza classe ativa nos seletores de cor
  document.querySelectorAll(".color-swatch").forEach(swatch => {
    if (swatch.getAttribute("data-color") === colorKey) {
      swatch.classList.add("active");
    } else {
      swatch.classList.remove("active");
    }
  });

  localStorage.setItem("omniarc_accent_color", colorKey);
}

function setupEventListeners() {
  // Alternador de Tema e Cores
  document.getElementById("btn-theme-toggle").addEventListener("click", toggleDarkMode);
  
  document.querySelectorAll(".color-swatch").forEach(swatch => {
    swatch.addEventListener("click", () => {
      const color = swatch.getAttribute("data-color");
      setAccentColor(color);
    });
  });

  // Seleção de Pastas
  document.getElementById("btn-choose-source").addEventListener("click", onSelectSourceFolder);
  document.getElementById("btn-choose-output").addEventListener("click", onSelectOutputFolder);
  document.getElementById("btn-rescan").addEventListener("click", onRescan);

  // Ações de Projeto
  document.getElementById("btn-new-arc").addEventListener("click", onAddNewArc);
  document.getElementById("btn-save-project").addEventListener("click", onSaveProject);
  document.getElementById("btn-load-project").addEventListener("click", onLoadProject);

  // Busca e Filtro
  document.getElementById("input-search").addEventListener("input", onSearchInput);

  // Cancelamento de Progresso
  document.getElementById("btn-cancel-progress").addEventListener("click", onCancelBuild);

  // Modal de Intervalo
  document.getElementById("btn-range-cancel").addEventListener("click", closeModalRange);
  document.getElementById("btn-range-confirm").addEventListener("click", onConfirmRange);

  // Modal de Legendas
  document.getElementById("btn-sub-modal-close").addEventListener("click", closeModalSubtitle);
  document.getElementById("btn-sub-modal-browse").addEventListener("click", onBrowseSubtitleFile);
  document.getElementById("btn-sub-modal-save").addEventListener("click", onSaveSubtitleSettings);
  document.getElementById("btn-sub-modal-remove").addEventListener("click", onRemoveSubtitle);
  document.getElementById("sub-modal-delay-input").addEventListener("input", (e) => {
    document.getElementById("sub-modal-delay-display").textContent = `${e.target.value || 0} ms`;
  });
  document.querySelectorAll(".btn-quick-delay").forEach(btn => {
    btn.addEventListener("click", () => {
      const delay = btn.getAttribute("data-delay");
      document.getElementById("sub-modal-delay-input").value = delay;
      document.getElementById("sub-modal-delay-display").textContent = `${delay} ms`;
    });
  });
}

// =============================================================================
// Comunicação com o Python (PyWebView API)
// =============================================================================

async function getApi() {
  if (window.pywebview && window.pywebview.api) {
    return window.pywebview.api;
  }
  return new Promise((resolve) => {
    window.addEventListener("pywebviewready", () => {
      resolve(window.pywebview.api);
    });
  });
}

async function checkSystemInfo() {
  const api = await getApi();
  if (api && api.get_system_info) {
    const info = await api.get_system_info();
    if (!info.ffmpeg_found) {
      alert("Aviso: FFmpeg não foi encontrado no sistema!\nCertifique-se de instalar o ffmpeg para poder gerar os filmes.");
    }
  }
}

async function onSelectSourceFolder() {
  const api = await getApi();
  const res = await api.select_source_folder();
  if (res && !res.cancelled && res.folder) {
    state.sourceDir = res.folder;
    document.getElementById("txt-source-dir").textContent = res.folder;
    state.episodes = res.episodes || [];
    state.filteredEpisodes = [...state.episodes];
    
    // Sugere pasta de saída padrão se ainda não tiver
    if (!state.outputDir) {
      state.outputDir = res.folder + "_Supercuts";
      document.getElementById("txt-output-dir").textContent = state.outputDir;
    }

    renderEpisodes();
  }
}

async function onSelectOutputFolder() {
  const api = await getApi();
  const res = await api.select_output_folder();
  if (res && !res.cancelled && res.folder) {
    state.outputDir = res.folder;
    document.getElementById("txt-output-dir").textContent = res.folder;
  }
}

async function onRescan() {
  if (!state.sourceDir) return;
  const api = await getApi();
  const res = await api.scan_episodes(state.sourceDir);
  if (res && res.success) {
    state.episodes = res.episodes || [];
    state.filteredEpisodes = [...state.episodes];
    renderEpisodes();
  }
}

async function onSaveProject() {
  if (state.arcs.length === 0 && !state.sourceDir) {
    alert("Adicione pelo menos um arco ou selecione uma pasta antes de salvar o projeto.");
    return;
  }
  const api = await getApi();
  const projectData = {
    project_name: state.projectName,
    source_dir: state.sourceDir,
    output_dir: state.outputDir,
    clean_temp_on_finish: true,
    arcs: state.arcs
  };
  const res = await api.save_project(projectData);
  if (res && res.success) {
    alert(`Projeto salvo com sucesso em:\n${res.file_path}`);
  } else {
    alert(`Erro ao salvar projeto: ${res.error || "Desconhecido"}`);
  }
}

async function onLoadProject() {
  const api = await getApi();
  const res = await api.load_project();
  if (res && res.success && res.config) {
    const cfg = res.config;
    state.projectName = cfg.project_name || "Projeto";
    state.sourceDir = cfg.source_dir || "";
    state.outputDir = cfg.output_dir || "";
    state.arcs = cfg.arcs || [];

    document.getElementById("txt-source-dir").textContent = state.sourceDir || "Nenhuma pasta selecionada";
    document.getElementById("txt-output-dir").textContent = state.outputDir || "Nenhuma pasta selecionada";

    if (res.episodes && res.episodes.length > 0) {
      state.episodes = res.episodes;
      state.filteredEpisodes = [...state.episodes];
      renderEpisodes();
    }
    renderArcs();
  }
}

// =============================================================================
// Renderização e Gestão de Episódios
// =============================================================================

function onSearchInput(e) {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    state.filteredEpisodes = [...state.episodes];
  } else {
    state.filteredEpisodes = state.episodes.filter(ep => 
      ep.title.toLowerCase().includes(query) ||
      ep.display_code.toLowerCase().includes(query) ||
      ep.file_name.toLowerCase().includes(query)
    );
  }
  renderEpisodes();
}

function renderEpisodes() {
  const container = document.getElementById("episodes-list");
  const countBadge = document.getElementById("badge-episode-count");
  countBadge.textContent = state.episodes.length;

  if (state.episodes.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-6 text-theme-muted">
        <p class="text-xs font-medium text-theme-main">Nenhum episódio carregado</p>
        <p class="text-[11px] text-theme-sub mt-1 max-w-[220px]">Selecione uma pasta com seus vídeos para listar os episódios automaticamente.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  state.filteredEpisodes.forEach(ep => {
    const card = document.createElement("div");
    card.className = "episode-card bg-theme-surface border border-theme rounded-xl p-3 flex items-center justify-between group border-theme-hover shadow-sm";

    const badgeOpEd = ep.has_op_ed 
      ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-accent-wash text-accent font-medium border border-accent-subtle">Capítulos OP/ED</span>`
      : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-theme-low text-theme-muted font-normal border border-theme">Completo</span>`;

    // Selo de Legendas
    let badgeSub = "";
    if (ep.external_sub_path) {
      const delayTxt = ep.external_sub_delay_ms !== 0 ? ` (${ep.external_sub_delay_ms > 0 ? "+" : ""}${ep.external_sub_delay_ms}ms)` : "";
      badgeSub = `<button class="btn-open-sub-modal text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium border border-emerald-500/30 flex items-center gap-1 transition-colors" title="Legenda externa: ${ep.external_sub_path}">
        <span>💬 PT-BR${delayTxt}</span>
      </button>`;
    } else if (ep.subtitles_count > 0) {
      badgeSub = `<button class="btn-open-sub-modal text-[10px] px-2 py-0.5 rounded-full bg-theme-low hover:bg-theme-hover text-theme-muted hover:text-theme-main font-normal border border-theme transition-colors" title="${ep.subtitles_summary}. Clique para vincular legenda PT-BR externa.">
        💬 ${ep.subtitles_count} Leg (+PT)
      </button>`;
    } else {
      badgeSub = `<button class="btn-open-sub-modal text-[10px] px-2 py-0.5 rounded-full bg-theme-low hover:bg-theme-hover text-theme-muted hover:text-theme-main font-normal border border-theme transition-colors" title="Nenhuma legenda embutida. Clique para adicionar legenda PT-BR externa.">
        + Legenda PT
      </button>`;
    }

    card.innerHTML = `
      <div class="flex items-center gap-2.5 overflow-hidden mr-2">
        <span class="text-xs font-semibold px-2 py-1 rounded-lg bg-theme-low text-theme-main border border-theme shrink-0 font-mono">
          ${ep.display_code}
        </span>
        <div class="flex flex-col min-w-0">
          <span class="text-xs font-medium text-theme-main truncate" title="${ep.title}">
            ${ep.title}
          </span>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[11px] text-theme-muted">${ep.duration_formatted}</span>
            ${badgeOpEd}
            ${badgeSub}
          </div>
        </div>
      </div>
      <button class="btn-add-to-arc text-xs text-accent hover:bg-accent-wash px-2.5 py-1 rounded-lg transition-colors font-medium shrink-0" title="Adicionar ao Arco Selecionado">
        + Adicionar
      </button>
    `;

    card.querySelector(".btn-add-to-arc").addEventListener("click", () => {
      addEpisodeToCurrentArc(ep.file_path);
    });

    const subBtn = card.querySelector(".btn-open-sub-modal");
    if (subBtn) {
      subBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openModalSubtitle(ep);
      });
    }

    container.appendChild(card);
  });
}

function addEpisodeToCurrentArc(filePath) {
  if (state.arcs.length === 0) {
    onAddNewArc();
  }
  const targetArc = state.arcs[state.arcs.length - 1];
  if (!targetArc.episode_paths.includes(filePath)) {
    targetArc.episode_paths.push(filePath);
    updateArcEstimatedDuration(targetArc);
    renderArcs();
  }
}

// =============================================================================
// Gestão de Arcos / Filmes
// =============================================================================

function onAddNewArc() {
  const arcNum = state.arcs.length + 1;
  const newArc = {
    arc_id: arcNum,
    code: `Bloco_${String(arcNum).padStart(2, "0")}`,
    title: `Arco ${arcNum}: Novo Bloco`,
    output_filename: `Filme_Bloco_${String(arcNum).padStart(2, "0")}.mkv`,
    episode_paths: [],
    strip_op_ed: true,
    estimated_duration: "00h 00m"
  };
  state.arcs.push(newArc);
  renderArcs();
}

function updateArcEstimatedDuration(arc) {
  let totalSec = 0;
  arc.episode_paths.forEach(p => {
    const ep = state.episodes.find(e => e.file_path === p);
    if (ep) totalSec += ep.duration_seconds;
  });
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  arc.estimated_duration = `${h}h ${String(m).padStart(2, "0")}m`;
}

function renderArcs() {
  const container = document.getElementById("arcs-container");
  const summary = document.getElementById("txt-arc-summary");
  summary.textContent = `${state.arcs.length} arco(s) configurado(s)`;

  if (state.arcs.length === 0) {
    container.innerHTML = `
      <div id="arcs-empty" class="h-full flex flex-col items-center justify-center text-center p-8 text-theme-muted">
        <p class="text-xs font-medium text-theme-main">Nenhum arco criado ainda</p>
        <p class="text-[11px] text-theme-sub mt-1 max-w-[260px]">Clique em <span class="text-accent font-semibold">+ Novo Arco</span> no topo para criar o primeiro bloco de filme.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  state.arcs.forEach((arc, index) => {
    const card = document.createElement("div");
    card.className = "bg-theme-surface border border-theme rounded-2xl p-5 flex flex-col gap-4 shadow-sm border-theme-hover transition-all";

    // Pílulas dos episódios incluídos
    const epPillsHtml = arc.episode_paths.map(p => {
      const ep = state.episodes.find(e => e.file_path === p);
      const code = ep ? ep.display_code : "EP";
      return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-theme-low border border-theme text-xs text-theme-main font-mono">
          ${code}
          <button data-path="${p}" class="btn-remove-ep text-theme-muted hover:text-rose-400 transition-colors">×</button>
        </span>
      `;
    }).join("");

    card.innerHTML = `
      <!-- Cabeçalho do Card -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-accent-wash text-accent font-semibold">
              ${arc.code}
            </span>
            <input type="text" value="${arc.title}" class="input-arc-title bg-transparent font-semibold text-sm text-theme-main focus:outline-none focus:border-b focus:border-accent transition-colors truncate w-full max-w-sm">
          </div>
          <p class="text-xs text-theme-muted mt-1">
            ${arc.episode_paths.length} episódio(s) • Duração estimada: ~${arc.estimated_duration}
          </p>
        </div>

        <!-- Toggle Remover OP/ED -->
        <div class="flex items-center gap-2 bg-theme-low px-3 py-1.5 rounded-xl border border-theme shrink-0">
          <label class="text-xs text-theme-sub font-medium cursor-pointer" for="toggle-op-${index}">
            Remover Aberturas / Encerramentos
          </label>
          <input type="checkbox" id="toggle-op-${index}" class="toggle-op-ed accent-[var(--color-accent)] w-4 h-4 rounded cursor-pointer" ${arc.strip_op_ed ? "checked" : ""}>
        </div>
      </div>

      <!-- Área de Episódios Incluídos -->
      <div class="bg-theme-low/50 rounded-xl p-3 border border-theme min-h-[50px] flex items-center flex-wrap gap-2">
        ${epPillsHtml || '<span class="text-xs text-theme-muted">Nenhum episódio neste bloco ainda. Clique em "+ Intervalo" ou "+ Adicionar" na lista à esquerda.</span>'}
      </div>

      <!-- Rodapé de Ações do Card -->
      <div class="flex items-center justify-between pt-1">
        <div class="flex items-center gap-2">
          <button class="btn-open-range text-xs text-theme-sub hover:text-theme-main bg-theme-low border border-theme px-3 py-1.5 rounded-xl transition-colors font-medium">
            + Intervalo (Ex: 1 a 8)
          </button>
          <button class="btn-clear-arc text-xs text-theme-muted hover:text-rose-400 px-2 py-1.5 transition-colors">
            Limpar
          </button>
          <button class="btn-delete-arc text-xs text-theme-muted hover:text-rose-400 px-2 py-1.5 transition-colors">
            Excluir Arco
          </button>
        </div>

        <button class="btn-build-arc px-5 py-2 rounded-xl bg-accent font-semibold text-xs hover:opacity-95 transition-all active:scale-95 shadow-sm flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
          Gerar Filme
        </button>
      </div>
    `;

    // Eventos do Card
    card.querySelector(".input-arc-title").addEventListener("change", (e) => {
      arc.title = e.target.value;
    });

    card.querySelector(".toggle-op-ed").addEventListener("change", (e) => {
      arc.strip_op_ed = e.target.checked;
    });

    card.querySelectorAll(".btn-remove-ep").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-path");
        arc.episode_paths = arc.episode_paths.filter(x => x !== p);
        updateArcEstimatedDuration(arc);
        renderArcs();
      });
    });

    card.querySelector(".btn-open-range").addEventListener("click", () => {
      openModalRange(arc.arc_id);
    });

    card.querySelector(".btn-clear-arc").addEventListener("click", () => {
      arc.episode_paths = [];
      updateArcEstimatedDuration(arc);
      renderArcs();
    });

    card.querySelector(".btn-delete-arc").addEventListener("click", () => {
      state.arcs.splice(index, 1);
      renderArcs();
    });

    card.querySelector(".btn-build-arc").addEventListener("click", () => {
      startBuildingArc(arc);
    });

    container.appendChild(card);
  });
}

// =============================================================================
// Modal de Intervalo de Episódios
// =============================================================================

function openModalRange(arcId) {
  state.activeArcIdForRange = arcId;
  const modal = document.getElementById("modal-range");
  modal.classList.remove("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.remove("scale-95");
}

function closeModalRange() {
  const modal = document.getElementById("modal-range");
  modal.classList.add("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.add("scale-95");
}

function onConfirmRange() {
  const startNum = parseInt(document.getElementById("range-start").value) || 1;
  const endNum = parseInt(document.getElementById("range-end").value) || 1;

  if (state.activeArcIdForRange !== null) {
    const arc = state.arcs.find(a => a.arc_id === state.activeArcIdForRange);
    if (arc) {
      state.episodes.forEach(ep => {
        if (!ep.is_movie && ep.episode_num >= startNum && ep.episode_num <= endNum) {
          if (!arc.episode_paths.includes(ep.file_path)) {
            arc.episode_paths.push(ep.file_path);
          }
        }
      });
      updateArcEstimatedDuration(arc);
      renderArcs();
    }
  }
  closeModalRange();
}

// =============================================================================
// Modal de Legendas Externas e Sincronia
// =============================================================================

function openModalSubtitle(ep) {
  state.activeEpisodeForSub = ep;
  state.tempSubPath = ep.external_sub_path || null;

  document.getElementById("sub-modal-ep-code").textContent = ep.display_code;
  document.getElementById("sub-modal-ep-title").textContent = ep.title;

  const pathBox = document.getElementById("sub-modal-file-path");
  if (ep.external_sub_path) {
    pathBox.textContent = ep.external_sub_path;
    pathBox.classList.remove("text-theme-muted");
    pathBox.classList.add("text-emerald-400");
  } else {
    pathBox.textContent = "Nenhuma legenda vinculada";
    pathBox.classList.add("text-theme-muted");
    pathBox.classList.remove("text-emerald-400");
  }

  const delay = ep.external_sub_delay_ms || 0;
  document.getElementById("sub-modal-delay-input").value = delay;
  document.getElementById("sub-modal-delay-display").textContent = `${delay > 0 ? "+" : ""}${delay} ms`;

  const modal = document.getElementById("modal-subtitle");
  modal.classList.remove("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.remove("scale-95");
}

function closeModalSubtitle() {
  const modal = document.getElementById("modal-subtitle");
  modal.classList.add("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.add("scale-95");
  state.activeEpisodeForSub = null;
  state.tempSubPath = null;
}

async function onBrowseSubtitleFile() {
  if (!state.activeEpisodeForSub) return;
  const api = await getApi();
  const res = await api.select_external_subtitle(state.activeEpisodeForSub.file_path);
  if (res && res.success && res.sub_path) {
    state.tempSubPath = res.sub_path;
    state.activeEpisodeForSub.external_sub_path = res.sub_path;
    const pathBox = document.getElementById("sub-modal-file-path");
    pathBox.textContent = res.sub_path;
    pathBox.classList.remove("text-theme-muted");
    pathBox.classList.add("text-emerald-400");
  }
}

async function onSaveSubtitleSettings() {
  if (!state.activeEpisodeForSub) return;
  const delay = parseInt(document.getElementById("sub-modal-delay-input").value) || 0;
  state.activeEpisodeForSub.external_sub_delay_ms = delay;
  if (state.tempSubPath) {
    state.activeEpisodeForSub.external_sub_path = state.tempSubPath;
  }

  const api = await getApi();
  await api.set_subtitle_delay(state.activeEpisodeForSub.file_path, delay);

  closeModalSubtitle();
  renderEpisodes();
}

async function onRemoveSubtitle() {
  if (!state.activeEpisodeForSub) return;
  const api = await getApi();
  await api.remove_external_subtitle(state.activeEpisodeForSub.file_path);
  state.activeEpisodeForSub.external_sub_path = null;
  state.activeEpisodeForSub.external_sub_delay_ms = 0;

  closeModalSubtitle();
  renderEpisodes();
}

// =============================================================================
// Execução do Pipeline e Barra de Progresso
// =============================================================================

async function startBuildingArc(arc) {
  if (state.isProcessing) {
    alert("Já existe uma renderização em andamento!");
    return;
  }

  if (arc.episode_paths.length === 0) {
    alert("Adicione pelo menos um episódio ao arco antes de gerar o filme.");
    return;
  }

  if (!state.outputDir) {
    alert("Selecione a pasta de destino dos filmes no topo da tela.");
    return;
  }

  const api = await getApi();
  showFloatingProgress(arc.title);
  state.isProcessing = true;

  const projectData = {
    output_dir: state.outputDir,
    clean_temp_on_finish: true
  };

  const res = await api.build_arc(arc, projectData);
  if (!res.success) {
    hideFloatingProgress();
    state.isProcessing = false;
    alert(`Erro ao iniciar renderização: ${res.error || "Desconhecido"}`);
  }
}

async function onCancelBuild() {
  const api = await getApi();
  await api.cancel_build();
}

function showFloatingProgress(taskName) {
  const dock = document.getElementById("floating-progress");
  document.getElementById("progress-task-name").textContent = taskName;
  document.getElementById("progress-percentage").textContent = "0%";
  document.getElementById("progress-bar-fill").style.width = "0%";
  dock.classList.remove("opacity-0", "pointer-events-none", "translate-y-4");
}

function hideFloatingProgress() {
  const dock = document.getElementById("floating-progress");
  dock.classList.add("opacity-0", "pointer-events-none", "translate-y-4");
}

// Callbacks Invocados pelo Python via evaluate_js
window.onProgressUpdate = function(data) {
  document.getElementById("progress-percentage").textContent = `${data.percentage}%`;
  document.getElementById("progress-bar-fill").style.width = `${data.percentage}%`;
  document.getElementById("progress-task-name").textContent = data.message;
};

window.onBuildFinished = function(result) {
  state.isProcessing = false;
  setTimeout(() => {
    hideFloatingProgress();
    if (result.success) {
      const val = result.validation || {};
      alert(`🎉 Filme gerado com sucesso!\n\nArquivo: ${val.file_name || ""}\nTamanho: ${val.file_size || ""}\nDuração: ${val.duration_formatted || ""}`);
    } else {
      alert(`❌ Erro no processamento: ${result.error || "Falha na execução"}`);
    }
  }, 1000);
};
