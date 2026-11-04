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
  selectedArcId: null,
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

  // Seleção de Arco Alvo no Painel Esquerdo
  const selectActiveArc = document.getElementById("select-active-arc");
  if (selectActiveArc) {
    selectActiveArc.addEventListener("change", (e) => {
      const arcId = parseInt(e.target.value);
      if (arcId) {
        setSelectedArc(arcId);
      }
    });
  }

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
    }
    if (state.arcs.length > 0) {
      state.selectedArcId = state.arcs[0].arc_id;
    }
    renderArcs();
    renderEpisodes();
  }
}

// =============================================================================
// Gestão do Arco Alvo (Seleção Ativa)
// =============================================================================

function getSelectedArc() {
  if (state.arcs.length === 0) return null;
  let arc = state.arcs.find(a => a.arc_id === state.selectedArcId);
  if (!arc) {
    arc = state.arcs[0];
    state.selectedArcId = arc.arc_id;
  }
  return arc;
}

function setSelectedArc(arcId) {
  state.selectedArcId = arcId;
  updateTargetArcUI();
  renderArcs();
  renderEpisodes();
}

function updateTargetArcUI() {
  const select = document.getElementById("select-active-arc");
  const codeBadge = document.getElementById("target-arc-code");
  if (!select) return;

  if (state.arcs.length === 0) {
    select.innerHTML = `<option value="">Nenhum bloco criado</option>`;
    select.disabled = true;
    if (codeBadge) codeBadge.textContent = "Nenhum";
    return;
  }

  select.disabled = false;
  const current = getSelectedArc();
  select.innerHTML = state.arcs.map(a => `
    <option value="${a.arc_id}" ${current && current.arc_id === a.arc_id ? "selected" : ""}>
      ${a.code}: ${a.title} (${a.episode_paths.length} eps)
    </option>
  `).join("");

  if (codeBadge && current) {
    codeBadge.textContent = current.code;
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

  updateTargetArcUI();

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
  const currentArc = getSelectedArc();

  state.filteredEpisodes.forEach(ep => {
    const card = document.createElement("div");

    // Verifica se já está no bloco ativo ou em outro bloco
    const isInSelectedArc = currentArc && currentArc.episode_paths.includes(ep.file_path);
    const otherArc = !isInSelectedArc 
      ? state.arcs.find(a => (!currentArc || a.arc_id !== currentArc.arc_id) && a.episode_paths.includes(ep.file_path)) 
      : null;

    if (isInSelectedArc) {
      card.className = "episode-card bg-emerald-500/[0.04] border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between group shadow-sm transition-all";
    } else {
      card.className = "episode-card bg-theme-surface border border-theme rounded-xl p-3 flex items-center justify-between group border-theme-hover shadow-sm transition-all";
    }

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

    // Selo de outro arco, se aplicável
    const otherArcBadge = otherArc 
      ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-theme-low text-theme-muted font-mono" title="Incluído em ${otherArc.title}">no ${otherArc.code}</span>` 
      : "";

    // Botão de Adição / Remoção Dinâmico
    let actionBtnHtml = "";
    if (isInSelectedArc) {
      actionBtnHtml = `
        <button class="btn-toggle-arc text-xs px-2.5 py-1 rounded-lg font-medium shrink-0 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30 transition-all flex items-center gap-1 group/btn" title="Já adicionado a este bloco (${currentArc ? currentArc.code : ''}). Clique para remover.">
          <span class="group-hover/btn:hidden flex items-center gap-1">✓ Adicionado</span>
          <span class="hidden group-hover/btn:inline flex items-center gap-1">✕ Remover</span>
        </button>
      `;
    } else {
      const targetLabel = currentArc ? currentArc.code : "Bloco";
      actionBtnHtml = `
        <button class="btn-toggle-arc text-xs text-accent hover:bg-accent-wash border border-transparent hover:border-accent-subtle px-2.5 py-1 rounded-lg transition-colors font-medium shrink-0" title="Adicionar ao ${targetLabel}">
          + Adicionar
        </button>
      `;
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
            ${otherArcBadge}
          </div>
        </div>
      </div>
      ${actionBtnHtml}
    `;

    card.querySelector(".btn-toggle-arc").addEventListener("click", () => {
      toggleEpisodeInCurrentArc(ep.file_path);
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

function toggleEpisodeInCurrentArc(filePath) {
  if (state.arcs.length === 0) {
    onAddNewArc();
  }
  const targetArc = getSelectedArc();
  if (!targetArc) return;

  const idx = targetArc.episode_paths.indexOf(filePath);
  if (idx >= 0) {
    targetArc.episode_paths.splice(idx, 1);
  } else {
    targetArc.episode_paths.push(filePath);
  }
  updateArcEstimatedDuration(targetArc);
  renderArcs();
  renderEpisodes();
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
    keep_first_op: true,
    keep_last_ed: true,
    estimated_duration: "00h 00m"
  };
  state.arcs.push(newArc);
  state.selectedArcId = newArc.arc_id;
  renderArcs();
  renderEpisodes();
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

  updateTargetArcUI();

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
  const currentSelected = getSelectedArc();

  state.arcs.forEach((arc, index) => {
    const isSelected = currentSelected && arc.arc_id === currentSelected.arc_id;
    const card = document.createElement("div");

    card.className = isSelected
      ? "arc-card bg-theme-surface border border-accent ring-2 ring-accent/60 rounded-2xl p-5 flex flex-col gap-4 shadow-lg shadow-accent/5 transition-all"
      : "arc-card bg-theme-surface border border-theme rounded-2xl p-5 flex flex-col gap-4 shadow-sm border-theme-hover transition-all cursor-pointer";

    // Pílulas dos episódios incluídos
    const epPillsHtml = arc.episode_paths.map(p => {
      const ep = state.episodes.find(e => e.file_path === p);
      const code = ep ? ep.display_code : "EP";
      return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-theme-low border border-theme text-xs text-theme-main font-mono">
          ${code}
          <button data-path="${p}" class="btn-remove-ep text-theme-muted hover:text-rose-400 transition-colors" title="Remover este episódio">×</button>
        </span>
      `;
    }).join("");

    // Indicador e botão de seleção de arco alvo
    const activeStatusHtml = isSelected
      ? `<span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-accent text-[var(--color-accent-text)] flex items-center gap-1 shadow-sm shrink-0">
          <span>🎯</span> Bloco Ativo
        </span>`
      : `<button type="button" class="btn-set-target text-[10px] font-semibold px-2 py-0.5 rounded-full bg-theme-low hover:bg-accent-wash text-theme-muted hover:text-accent border border-theme transition-all shrink-0" title="Clique para selecionar este bloco como destino das adições">
          Definir como Ativo
        </button>`;

    card.innerHTML = `
      <!-- Cabeçalho do Card -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-accent-wash text-accent font-semibold shrink-0">
              ${arc.code}
            </span>
            <input type="text" value="${arc.title}" class="input-arc-title bg-transparent font-semibold text-sm text-theme-main focus:outline-none focus:border-b focus:border-accent transition-colors truncate w-full max-w-sm">
            ${activeStatusHtml}
          </div>
          <p class="text-xs text-theme-muted mt-1">
            ${arc.episode_paths.length} episódio(s) • Duração estimada: ~${arc.estimated_duration}
          </p>
        </div>

        <!-- Opções de Corte OP/ED -->
        <div class="flex flex-col gap-1.5 bg-theme-low px-3 py-2 rounded-xl border border-theme shrink-0">
          <div class="flex items-center justify-between gap-3">
            <label class="text-xs text-theme-main font-medium cursor-pointer" for="toggle-op-${index}">
              Remover Aberturas / Encerramentos
            </label>
            <input type="checkbox" id="toggle-op-${index}" class="toggle-op-ed accent-[var(--color-accent)] w-4 h-4 rounded cursor-pointer" ${arc.strip_op_ed ? "checked" : ""}>
          </div>
          <!-- Sub-opções: Preservar Intro do Filme e Créditos Finais -->
          <div class="options-op-ed-sub flex items-center gap-3 pt-1.5 border-t border-theme/40 text-[11px] ${arc.strip_op_ed ? '' : 'opacity-40 pointer-events-none'}">
            <label class="flex items-center gap-1.5 cursor-pointer text-theme-sub hover:text-theme-main" title="Mantém a abertura do primeiro episódio como introdução do filme">
              <input type="checkbox" class="toggle-keep-first-op accent-[var(--color-accent)] w-3.5 h-3.5 rounded cursor-pointer" ${arc.keep_first_op !== false ? "checked" : ""}>
              <span>🎬 1ª Abertura (Intro)</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer text-theme-sub hover:text-theme-main" title="Mantém o encerramento do último episódio como créditos finais do filme">
              <input type="checkbox" class="toggle-keep-last-ed accent-[var(--color-accent)] w-3.5 h-3.5 rounded cursor-pointer" ${arc.keep_last_ed !== false ? "checked" : ""}>
              <span>📜 Último Encerramento (Créditos)</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Área de Episódios Incluídos -->
      <div class="bg-theme-low/50 rounded-xl p-3 border border-theme min-h-[50px] flex items-center flex-wrap gap-2">
        ${epPillsHtml || '<span class="text-xs text-theme-muted">Nenhum episódio neste bloco ainda. Clique em "+ Adicionar Episódios" abaixo ou use a lista à esquerda.</span>'}
      </div>

      <!-- Rodapé de Ações do Card -->
      <div class="flex items-center justify-between pt-1">
        <div class="flex items-center gap-2">
          <button class="btn-open-range text-xs text-theme-sub hover:text-theme-main bg-theme-low border border-theme hover:border-accent-subtle px-3 py-1.5 rounded-xl transition-colors font-medium flex items-center gap-1.5" title="Adicionar episódios em lote por temporada e intervalo">
            <span>📑</span> + Adicionar Episódios
          </button>
          <button class="btn-clear-arc text-xs text-theme-muted hover:text-rose-400 px-2 py-1.5 transition-colors">
            Limpar
          </button>
          <button class="btn-delete-arc text-xs text-theme-muted hover:text-rose-400 px-2 py-1.5 transition-colors">
            Excluir Bloco
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

    // Click no card seleciona como ativo se não for já
    if (!isSelected) {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("label")) {
          return;
        }
        setSelectedArc(arc.arc_id);
      });
      const btnSetTarget = card.querySelector(".btn-set-target");
      if (btnSetTarget) {
        btnSetTarget.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelectedArc(arc.arc_id);
        });
      }
    }

    // Input do Título
    const inputTitle = card.querySelector(".input-arc-title");
    inputTitle.addEventListener("change", (e) => {
      arc.title = e.target.value;
      updateTargetArcUI();
    });
    inputTitle.addEventListener("click", (e) => e.stopPropagation());

    // Toggles de OP/ED
    const toggleOp = card.querySelector(".toggle-op-ed");
    const subOptions = card.querySelector(".options-op-ed-sub");
    toggleOp.addEventListener("change", (e) => {
      arc.strip_op_ed = e.target.checked;
      if (subOptions) {
        if (arc.strip_op_ed) {
          subOptions.classList.remove("opacity-40", "pointer-events-none");
        } else {
          subOptions.classList.add("opacity-40", "pointer-events-none");
        }
      }
    });

    const toggleKop = card.querySelector(".toggle-keep-first-op");
    if (toggleKop) {
      toggleKop.addEventListener("change", (e) => {
        arc.keep_first_op = e.target.checked;
      });
    }

    const toggleKed = card.querySelector(".toggle-keep-last-ed");
    if (toggleKed) {
      toggleKed.addEventListener("change", (e) => {
        arc.keep_last_ed = e.target.checked;
      });
    }

    // Remoção individual de episódio (atualiza também a lista da esquerda!)
    card.querySelectorAll(".btn-remove-ep").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const p = btn.getAttribute("data-path");
        arc.episode_paths = arc.episode_paths.filter(x => x !== p);
        updateArcEstimatedDuration(arc);
        renderArcs();
        renderEpisodes();
      });
    });

    // Abrir Modal de Adição em Lote
    card.querySelector(".btn-open-range").addEventListener("click", (e) => {
      e.stopPropagation();
      openModalRange(arc.arc_id);
    });

    // Limpar Bloco
    card.querySelector(".btn-clear-arc").addEventListener("click", (e) => {
      e.stopPropagation();
      if (arc.episode_paths.length === 0) return;
      arc.episode_paths = [];
      updateArcEstimatedDuration(arc);
      renderArcs();
      renderEpisodes();
    });

    // Excluir Bloco
    card.querySelector(".btn-delete-arc").addEventListener("click", (e) => {
      e.stopPropagation();
      state.arcs.splice(index, 1);
      if (state.selectedArcId === arc.arc_id) {
        state.selectedArcId = state.arcs.length > 0 ? state.arcs[0].arc_id : null;
      }
      renderArcs();
      renderEpisodes();
    });

    // Gerar Filme
    card.querySelector(".btn-build-arc").addEventListener("click", (e) => {
      e.stopPropagation();
      startBuildingArc(arc);
    });

    container.appendChild(card);
  });
}

// =============================================================================
// Modal de Adição de Episódios em Lote (por Temporada e Intervalo)
// =============================================================================

function openModalRange(arcId) {
  state.activeArcIdForRange = arcId;
  state.selectedArcId = arcId;
  const targetArc = state.arcs.find(a => a.arc_id === arcId);

  const badge = document.getElementById("range-target-arc-badge");
  if (badge && targetArc) {
    badge.textContent = targetArc.code;
  }

  // Agrupa episódios por temporada
  const seasonMap = new Map();
  let movieCount = 0;

  state.episodes.forEach(ep => {
    if (ep.is_movie) {
      movieCount++;
    } else {
      const s = ep.season || 1;
      if (!seasonMap.has(s)) {
        seasonMap.set(s, { season: s, count: 0, minEp: ep.episode_num, maxEp: ep.episode_num });
      }
      const info = seasonMap.get(s);
      info.count++;
      info.minEp = Math.min(info.minEp, ep.episode_num);
      info.maxEp = Math.max(info.maxEp, ep.episode_num);
    }
  });

  const seasonSelect = document.getElementById("range-season");
  seasonSelect.innerHTML = "";

  const seasons = Array.from(seasonMap.values()).sort((a, b) => a.season - b.season);

  seasons.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.season;
    opt.textContent = `Temporada ${s.season} (${s.count} episódios)`;
    seasonSelect.appendChild(opt);
  });

  if (movieCount > 0) {
    const opt = document.createElement("option");
    opt.value = 0;
    opt.textContent = `Filmes / Especiais (${movieCount} itens)`;
    seasonSelect.appendChild(opt);
  }

  // Escolhe temporada padrão com base no que já está no bloco
  let defaultSeason = seasons.length > 0 ? seasons[0].season : 1;
  if (targetArc && targetArc.episode_paths.length > 0) {
    const lastPath = targetArc.episode_paths[targetArc.episode_paths.length - 1];
    const lastEp = state.episodes.find(e => e.file_path === lastPath);
    if (lastEp) {
      defaultSeason = lastEp.is_movie ? 0 : (lastEp.season || 1);
    }
  }

  seasonSelect.value = defaultSeason;

  function updateInputsForSelectedSeason(seasonNum) {
    const startInput = document.getElementById("range-start");
    const endInput = document.getElementById("range-end");
    const hint = document.getElementById("range-season-hint");

    if (seasonNum === 0) {
      startInput.value = 1;
      endInput.value = movieCount || 1;
      if (hint) hint.textContent = `${movieCount} filme(s) disponível(is)`;
      return;
    }

    const sInfo = seasonMap.get(seasonNum);
    if (sInfo) {
      startInput.min = sInfo.minEp;
      startInput.max = sInfo.maxEp;
      endInput.min = sInfo.minEp;
      endInput.max = sInfo.maxEp;

      // Sugestão esperta: se já houver episódios dessa temporada no bloco, começa do próximo
      let nextStart = sInfo.minEp;
      if (targetArc && targetArc.episode_paths.length > 0) {
        const addedSeasonEps = state.episodes.filter(e => 
          targetArc.episode_paths.includes(e.file_path) && !e.is_movie && e.season === seasonNum
        );
        if (addedSeasonEps.length > 0) {
          const maxAdded = Math.max(...addedSeasonEps.map(e => e.episode_num));
          if (maxAdded < sInfo.maxEp) {
            nextStart = maxAdded + 1;
          }
        }
      }

      startInput.value = nextStart;
      endInput.value = Math.min(nextStart + 7, sInfo.maxEp);
      if (hint) {
        hint.textContent = `Episódios desta temporada: ${sInfo.minEp} a ${sInfo.maxEp} (total: ${sInfo.count})`;
      }
    }
  }

  seasonSelect.onchange = (e) => {
    updateInputsForSelectedSeason(parseInt(e.target.value));
  };

  updateInputsForSelectedSeason(parseInt(seasonSelect.value));

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
  const seasonSelect = document.getElementById("range-season");
  const targetSeason = seasonSelect ? parseInt(seasonSelect.value) : 1;
  const startNum = parseInt(document.getElementById("range-start").value) || 0;
  const endNum = parseInt(document.getElementById("range-end").value) || 1;

  if (state.activeArcIdForRange !== null) {
    const arc = state.arcs.find(a => a.arc_id === state.activeArcIdForRange);
    if (arc) {
      const matching = state.episodes.filter(ep => {
        const epSeason = ep.is_movie ? 0 : (ep.season || 1);
        return epSeason === targetSeason && ep.episode_num >= startNum && ep.episode_num <= endNum;
      }).sort((a, b) => a.episode_num - b.episode_num);

      matching.forEach(ep => {
        if (!arc.episode_paths.includes(ep.file_path)) {
          arc.episode_paths.push(ep.file_path);
        }
      });

      updateArcEstimatedDuration(arc);
      renderArcs();
      renderEpisodes();
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

  // 1. Preenche lista de legendas embutidas no arquivo de vídeo
  const internalList = document.getElementById("sub-modal-internal-list");
  const internalCount = document.getElementById("sub-modal-internal-count");
  const subStreams = (ep.streams || []).filter(s => s.codec_type === "subtitle");
  
  if (internalCount) {
    internalCount.textContent = `${subStreams.length} faixa${subStreams.length !== 1 ? 's' : ''}`;
  }

  if (internalList) {
    if (subStreams.length === 0) {
      internalList.innerHTML = `<p class="text-[11px] text-theme-muted italic py-1">Nenhuma legenda interna encontrada no contêiner deste vídeo.</p>`;
    } else {
      internalList.innerHTML = subStreams.map(s => {
        const lang = (s.language || "und").toUpperCase();
        const title = s.title ? s.title : "Sem título";
        const codec = (s.codec_name || "sub").toUpperCase();
        return `
          <div class="flex items-center justify-between bg-theme-base/60 border border-theme/60 rounded-lg px-2.5 py-1.5 text-[11px]">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-theme-low text-theme-main font-semibold border border-theme/80 shrink-0">
                ${lang}
              </span>
              <span class="text-theme-main truncate font-medium" title="${title}">${title}</span>
            </div>
            <span class="text-[10px] font-mono text-theme-muted uppercase ml-2 shrink-0">${codec}</span>
          </div>
        `;
      }).join("");
    }
  }

  // 2. Preenche status da legenda externa
  updateModalExternalSubUI();

  // 3. Preenche delay de sincronia
  const delay = ep.external_sub_delay_ms || 0;
  document.getElementById("sub-modal-delay-input").value = delay;
  document.getElementById("sub-modal-delay-display").textContent = `${delay > 0 ? "+" : ""}${delay} ms`;

  const modal = document.getElementById("modal-subtitle");
  modal.classList.remove("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.remove("scale-95");
}

function updateModalExternalSubUI() {
  const ep = state.activeEpisodeForSub;
  if (!ep) return;

  const currentPath = state.tempSubPath || ep.external_sub_path;
  const pathBox = document.getElementById("sub-modal-file-path");
  const extBadge = document.getElementById("sub-modal-ext-badge");
  const browseLabel = document.getElementById("btn-sub-browse-label");
  const removeBtn = document.getElementById("btn-sub-modal-remove");

  if (currentPath) {
    pathBox.textContent = currentPath;
    pathBox.className = "flex-1 bg-theme-base border border-emerald-500/40 rounded-xl px-3 py-2 text-[11px] text-emerald-400 font-mono truncate";
    if (extBadge) {
      extBadge.textContent = "Vinculada (PT-BR)";
      extBadge.className = "text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    }
    if (browseLabel) browseLabel.textContent = "Trocar Arquivo...";
    if (removeBtn) removeBtn.style.display = "block";
  } else {
    pathBox.textContent = "Nenhuma legenda externa vinculada";
    pathBox.className = "flex-1 bg-theme-base border border-theme rounded-xl px-3 py-2 text-[11px] text-theme-muted font-mono truncate";
    if (extBadge) {
      extBadge.textContent = "Nenhuma";
      extBadge.className = "text-[10px] px-2 py-0.5 rounded font-normal bg-theme-base text-theme-muted border border-theme";
    }
    if (browseLabel) browseLabel.textContent = "Adicionar Arquivo (.srt, .ass)...";
    if (removeBtn) removeBtn.style.display = "none";
  }
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
    updateModalExternalSubUI();
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
  state.tempSubPath = null;

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
