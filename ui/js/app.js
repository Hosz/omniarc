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
  activeEpisodeForChapters: null,
  tempChapters: [],
  activeArcForChapters: null,
  tempArcData: null,
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

  // Modal de Capítulos & Segmentos do Episódio
  document.getElementById("btn-chap-modal-close").addEventListener("click", closeModalChapters);
  document.getElementById("btn-chap-modal-save").addEventListener("click", onSaveChaptersSettings);
  document.getElementById("btn-chap-select-all").addEventListener("click", onSelectAllChapters);
  document.getElementById("btn-chap-preset-strip").addEventListener("click", onPresetStripOpEd);
  document.getElementById("btn-chap-translate").addEventListener("click", onTranslateChapters);
  document.getElementById("btn-chap-apply-mkv").addEventListener("click", onApplyChaptersToMkv);

  // Modal Consolidado de Capítulos & Timeline do Filme
  document.getElementById("btn-arc-chap-modal-close").addEventListener("click", closeModalArcChapters);
  document.getElementById("btn-arc-chap-modal-save").addEventListener("click", onSaveArcChaptersSettings);
  document.getElementById("btn-arc-chap-select-all").addEventListener("click", onSelectAllArcChapters);
  document.getElementById("btn-arc-chap-preset-strip").addEventListener("click", onPresetStripOpEdArc);
  document.getElementById("btn-arc-chap-translate").addEventListener("click", onTranslateArcChapters);
  document.getElementById("btn-arc-chap-apply-mkv").addEventListener("click", onApplyArcChaptersToMkv);
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

    // Selo de Capítulos / OP/ED com abertura de modal interativo
    let badgeChapters = "";
    if (ep.chapters && ep.chapters.length > 0) {
      const hasCustom = ep.chapters.some(c => c.kept === false);
      const customTxt = hasCustom ? " ✂️ Custom" : (ep.has_op_ed ? " (OP/ED)" : "");
      badgeChapters = `
        <button class="btn-open-chapters-modal text-[10px] px-2 py-0.5 rounded-full ${hasCustom ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : (ep.has_op_ed ? 'bg-accent-wash text-accent border border-accent-subtle' : 'bg-theme-low text-theme-muted border border-theme')} hover:brightness-110 font-medium flex items-center gap-1 transition-colors" title="Ver, traduzir e selecionar capítulos para corte">
          <span>🔖 ${ep.chapters.length} Capítulos${customTxt}</span>
        </button>
      `;
    } else {
      badgeChapters = `<span class="text-[10px] px-2 py-0.5 rounded-full bg-theme-low text-theme-muted font-normal border border-theme">Sem Capítulos</span>`;
    }

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
            ${badgeChapters}
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

    const chapBtn = card.querySelector(".btn-open-chapters-modal");
    if (chapBtn) {
      chapBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openModalChapters(ep);
      });
    }

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

    const detailedBadge = arc.detailed_chapters !== false
      ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium shrink-0" title="Capítulos detalhados ativados para este filme">✨ Detalhado</span>`
      : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-theme-low text-theme-muted border border-theme font-medium shrink-0" title="Apenas marcadores por episódio">Resumido</span>`;

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
            ${detailedBadge}
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
          <button class="btn-open-arc-chapters text-xs text-theme-sub hover:text-theme-main bg-theme-low border border-theme hover:border-accent-subtle px-3 py-1.5 rounded-xl transition-colors font-medium flex items-center gap-1.5" title="Ver linha do tempo completa e gerenciar capítulos do filme">
            <span>🔖</span> Capítulos do Filme
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

    // Abrir Modal de Capítulos do Filme
    const btnArcChapters = card.querySelector(".btn-open-arc-chapters");
    if (btnArcChapters) {
      btnArcChapters.addEventListener("click", (e) => {
        e.stopPropagation();
        openModalArcChapters(arc);
      });
    }

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

// =============================================================================
// Modal de Gerenciamento e Seleção de Capítulos / Cortes
// =============================================================================

function formatSecondsToTime(seconds) {
  if (!seconds || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function openModalChapters(ep) {
  state.activeEpisodeForChapters = ep;
  state.tempChapters = JSON.parse(JSON.stringify(ep.chapters || []));
  
  // Garante que cada capítulo tenha a propriedade 'kept'
  state.tempChapters.forEach(c => {
    if (c.kept === undefined) c.kept = true;
  });

  document.getElementById("chap-modal-ep-code").textContent = ep.display_code;
  document.getElementById("chap-modal-ep-title").textContent = ep.title;
  document.getElementById("chap-modal-orig-dur").textContent = ep.duration_formatted;

  renderModalChaptersList();

  const modal = document.getElementById("modal-chapters");
  modal.classList.remove("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.remove("scale-95");
}

function closeModalChapters() {
  const modal = document.getElementById("modal-chapters");
  modal.classList.add("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.add("scale-95");
  state.activeEpisodeForChapters = null;
  state.tempChapters = [];
}

function renderModalChaptersList() {
  const container = document.getElementById("chap-modal-list");
  if (!container) return;

  if (state.tempChapters.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-theme-muted bg-theme-low/20 rounded-xl border border-theme">
        <p class="text-xs">Nenhum capítulo detectado neste vídeo.</p>
        <p class="text-[11px] text-theme-sub mt-1">O arquivo será mantido integralmente durante a compilação.</p>
      </div>
    `;
    updateModalChaptersSummary();
    return;
  }

  container.innerHTML = state.tempChapters.map((c, idx) => {
    const isKept = c.kept !== false;
    const durSec = Math.max(0, c.end_time - c.start_time);
    const durFormatted = formatSecondsToTime(durSec);
    const timeRange = `${formatSecondsToTime(c.start_time)} → ${formatSecondsToTime(c.end_time)}`;

    let typeBadge = "";
    if (c.is_op) {
      typeBadge = `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">Abertura (OP)</span>`;
    } else if (c.is_ed) {
      const isPreview = /preview|pr[eé]via|pr[oó]ximo|next|teaser|trailer/i.test((c.title || "") + " " + (c.title_pt || ""));
      const isPostCredits = /epilogue|ep[ií]logo|post-credits|p[oó]s-cr[eé]ditos|stroll|omake|extra|bonus|curta/i.test((c.title || "") + " " + (c.title_pt || ""));
      let lbl = "Encerramento (ED)";
      if (isPreview) lbl = "Prévia";
      else if (isPostCredits) lbl = "Pós-Créditos / Extra";
      typeBadge = `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">${lbl}</span>`;
    } else {
      typeBadge = `<span class="text-[10px] px-1.5 py-0.5 rounded bg-theme-base text-theme-muted border border-theme">Conteúdo</span>`;
    }

    const titleOriginal = c.title || `Capítulo ${idx + 1}`;
    const titlePt = c.title_pt && c.title_pt !== titleOriginal 
      ? `<span class="text-xs font-semibold text-theme-main">${c.title_pt}</span> <span class="text-[10px] text-theme-muted font-normal">(${titleOriginal})</span>` 
      : `<span class="text-xs font-semibold text-theme-main">${titleOriginal}</span>`;

    const statusBadge = isKept 
      ? `<span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">✓ Manter</span>` 
      : `<span class="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">✕ Cortar</span>`;

    const rowBg = isKept 
      ? "bg-theme-base/60 border-theme hover:bg-theme-base" 
      : "bg-theme-low/20 border-rose-500/20 opacity-60 hover:opacity-80";

    return `
      <div class="chap-row flex items-center justify-between p-2.5 rounded-xl border ${rowBg} transition-all cursor-pointer select-none" data-idx="${idx}">
        <div class="flex items-center gap-3 min-w-0">
          <input type="checkbox" class="chap-checkbox w-4 h-4 rounded text-accent focus:ring-0 cursor-pointer pointer-events-none" ${isKept ? 'checked' : ''}>
          <span class="text-[11px] font-mono text-theme-muted font-bold shrink-0">#${idx + 1}</span>
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              ${titlePt}
              ${typeBadge}
            </div>
            <span class="text-[11px] font-mono text-theme-muted mt-0.5">${timeRange} (${durFormatted})</span>
          </div>
        </div>
        <div class="shrink-0 ml-2">
          ${statusBadge}
        </div>
      </div>
    `;
  }).join("");

  // Adiciona evento de clique em cada linha
  container.querySelectorAll(".chap-row").forEach(row => {
    row.addEventListener("click", () => {
      const idx = parseInt(row.getAttribute("data-idx"));
      if (state.tempChapters[idx]) {
        state.tempChapters[idx].kept = !state.tempChapters[idx].kept;
        renderModalChaptersList();
      }
    });
  });

  updateModalChaptersSummary();
}

function updateModalChaptersSummary() {
  const ep = state.activeEpisodeForChapters;
  if (!ep) return;

  let totalKeptSec = 0;
  state.tempChapters.forEach(c => {
    if (c.kept !== false) {
      totalKeptSec += Math.max(0, c.end_time - c.start_time);
    }
  });

  const origSec = ep.duration_seconds || 0;
  const cutSec = Math.max(0, origSec - totalKeptSec);

  document.getElementById("chap-modal-final-dur").textContent = formatSecondsToTime(totalKeptSec);
  const diffBadge = document.getElementById("chap-modal-diff-badge");
  if (cutSec > 0.5) {
    diffBadge.textContent = `-${formatSecondsToTime(cutSec)} cortados`;
    diffBadge.className = "text-[11px] px-2 py-0.5 rounded-full font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30";
  } else {
    diffBadge.textContent = "Sem cortes (Integral)";
    diffBadge.className = "text-[11px] px-2 py-0.5 rounded-full font-mono bg-theme-base text-theme-muted border border-theme";
  }
}

function onSelectAllChapters() {
  state.tempChapters.forEach(c => {
    c.kept = true;
  });
  renderModalChaptersList();
}

function onPresetStripOpEd() {
  state.tempChapters.forEach(c => {
    if (c.is_op || c.is_ed) {
      c.kept = false;
    } else {
      c.kept = true;
    }
  });
  renderModalChaptersList();
}

async function onTranslateChapters() {
  const ep = state.activeEpisodeForChapters;
  if (!ep) return;

  const btn = document.getElementById("btn-chap-translate");
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<span>⏳</span> Traduzindo...`;
  btn.disabled = true;

  try {
    const api = await getApi();
    const res = await api.translate_episode_chapters(ep.file_path, true);
    if (res.success && res.chapters) {
      res.chapters.forEach((tc, idx) => {
        if (state.tempChapters[idx]) {
          state.tempChapters[idx].title_pt = tc.title_pt;
        }
      });
      renderModalChaptersList();
    } else {
      alert(`Aviso ao traduzir: ${res.error || "Falha na tradução"}`);
    }
  } catch (err) {
    alert(`Erro ao contatar API de tradução: ${err}`);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

async function onApplyChaptersToMkv() {
  const ep = state.activeEpisodeForChapters;
  if (!ep) return;

  if (!confirm(`Deseja gravar os capítulos traduzidos diretamente no arquivo MKV original?\n\nArquivo: ${ep.file_name}\n\nIsso usa o mkvpropedit de forma lossless instantânea sem modificar os fluxos de áudio e vídeo.`)) {
    return;
  }

  const btn = document.getElementById("btn-chap-apply-mkv");
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<span>⏳</span> Gravando...`;
  btn.disabled = true;

  try {
    const api = await getApi();
    await api.save_episode_chapters_selection(ep.file_path, state.tempChapters);
    const res = await api.apply_chapters_to_file(ep.file_path, true);
    if (res.success) {
      alert("✅ Sucesso!\nOs capítulos traduzidos em PT-BR foram gravados no arquivo MKV!");
    } else {
      alert(`❌ Erro ao gravar: ${res.error || "Falha ao executar mkvpropedit"}`);
    }
  } catch (err) {
    alert(`Erro: ${err}`);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

async function onSaveChaptersSettings() {
  const ep = state.activeEpisodeForChapters;
  if (!ep) return;

  ep.chapters = JSON.parse(JSON.stringify(state.tempChapters));
  const api = await getApi();
  await api.save_episode_chapters_selection(ep.file_path, ep.chapters);

  closeModalChapters();
  renderEpisodes();
}

// =============================================================================
// Modal Consolidado de Capítulos & Timeline do Filme
// =============================================================================

async function openModalArcChapters(arc) {
  if (!arc || !arc.episode_paths || arc.episode_paths.length === 0) {
    alert("Adicione pelo menos um episódio ao bloco para visualizar e gerenciar os capítulos do filme.");
    return;
  }

  state.activeArcForChapters = arc;
  if (arc.detailed_chapters === undefined) arc.detailed_chapters = true;

  document.getElementById("arc-chap-modal-code").textContent = arc.code;
  document.getElementById("arc-chap-modal-title").textContent = `${arc.title} (${arc.episode_paths.length} episódios)`;
  document.getElementById("arc-chap-toggle-detailed").checked = arc.detailed_chapters !== false;

  const container = document.getElementById("arc-chap-modal-list");
  container.innerHTML = `
    <div class="p-8 text-center text-theme-muted">
      <div class="inline-block animate-spin text-lg mb-2">⏳</div>
      <p class="text-xs">Sondando e unificando linha do tempo dos capítulos...</p>
    </div>
  `;

  const modal = document.getElementById("modal-arc-chapters");
  modal.classList.remove("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.remove("scale-95");

  try {
    const api = await getApi();
    const res = await api.get_arc_chapters(arc);
    if (res && res.success) {
      state.tempArcData = res;
      renderModalArcChaptersList();
    } else {
      container.innerHTML = `
        <div class="p-6 text-center text-rose-400 bg-rose-500/10 rounded-xl border border-rose-500/20">
          <p class="text-xs">Não foi possível carregar os capítulos: ${res?.error || 'Erro desconhecido'}</p>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `
      <div class="p-6 text-center text-rose-400 bg-rose-500/10 rounded-xl border border-rose-500/20">
        <p class="text-xs">Erro ao carregar dados: ${err}</p>
      </div>
    `;
  }
}

function closeModalArcChapters() {
  const modal = document.getElementById("modal-arc-chapters");
  modal.classList.add("opacity-0", "pointer-events-none");
  modal.querySelector("div").classList.add("scale-95");
  state.activeArcForChapters = null;
  state.tempArcData = null;
}

function renderModalArcChaptersList() {
  const container = document.getElementById("arc-chap-modal-list");
  if (!container || !state.tempArcData) return;

  const episodes = state.tempArcData.episodes || [];
  if (episodes.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-theme-muted bg-theme-low/20 rounded-xl border border-theme">
        <p class="text-xs">Nenhum episódio encontrado neste arco.</p>
      </div>
    `;
    updateModalArcChaptersSummary();
    return;
  }

  // Recalcula timestamps contínuos do filme com base nos capítulos marcados (kept)
  let movieAccumTime = 0.0;
  let totalActiveChaps = 0;
  let totalChaps = 0;

  episodes.forEach((ep) => {
    let epKeptDuration = 0.0;
    (ep.chapters || []).forEach((c) => {
      totalChaps++;
      const dur = Math.max(0, c.end_time - c.start_time);
      if (c.kept !== false) {
        c.movie_start_time = movieAccumTime + epKeptDuration;
        c.movie_start_formatted = formatSecondsToTime(c.movie_start_time);
        epKeptDuration += dur;
        totalActiveChaps++;
      } else {
        c.movie_start_time = null;
        c.movie_start_formatted = "--:--";
      }
    });

    ep.movie_offset_seconds = movieAccumTime;
    ep.movie_offset_formatted = formatSecondsToTime(movieAccumTime);
    ep.cut_duration_seconds = epKeptDuration > 0 ? epKeptDuration : ep.duration_seconds;
    movieAccumTime += ep.cut_duration_seconds;
  });

  state.tempArcData.total_movie_duration_seconds = movieAccumTime;
  state.tempArcData.total_movie_duration_formatted = formatSecondsToTime(movieAccumTime);
  state.tempArcData.kept_chapters = totalActiveChaps;
  state.tempArcData.total_chapters = totalChaps;

  container.innerHTML = episodes.map((ep, epIdx) => {
    const epChapsHtml = (ep.chapters || []).map((c, cIdx) => {
      const isKept = c.kept !== false;
      const durSec = Math.max(0, c.end_time - c.start_time);
      const durFormatted = formatSecondsToTime(durSec);
      const epTimeRange = `${formatSecondsToTime(c.start_time)} → ${formatSecondsToTime(c.end_time)}`;

      let typeBadge = "";
      if (c.is_op) {
        typeBadge = `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">Abertura</span>`;
      } else if (c.is_ed) {
        const isPreview = /preview|pr[eé]via|pr[oó]ximo|next|teaser|trailer/i.test((c.title || "") + " " + (c.title_pt || ""));
        const isPostCredits = /epilogue|ep[ií]logo|post-credits|p[oó]s-cr[eé]ditos|stroll|omake|extra|bonus|curta/i.test((c.title || "") + " " + (c.title_pt || ""));
        let lbl = "Encerramento";
        if (isPreview) lbl = "Prévia";
        else if (isPostCredits) lbl = "Pós-Créditos / Extra";
        typeBadge = `<span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">${lbl}</span>`;
      } else {
        typeBadge = `<span class="text-[10px] px-1.5 py-0.5 rounded bg-theme-base text-theme-muted border border-theme">Conteúdo</span>`;
      }

      const titleOriginal = c.title || `Capítulo ${cIdx + 1}`;
      const titlePt = c.title_pt && c.title_pt !== titleOriginal 
        ? `<span class="text-xs font-semibold text-theme-main">${c.title_pt}</span> <span class="text-[10px] text-theme-muted font-normal">(${titleOriginal})</span>` 
        : `<span class="text-xs font-semibold text-theme-main">${titleOriginal}</span>`;

      const statusBadge = isKept 
        ? `<span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">✓ No Filme</span>` 
        : `<span class="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">✕ Cortar</span>`;

      const movieTimestampBadge = isKept 
        ? `<span class="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-accent-wash text-accent border border-accent-subtle" title="Tempo de início no filme final">🎬 ${c.movie_start_formatted}</span>` 
        : `<span class="text-[11px] font-mono text-theme-muted px-2 py-0.5 rounded bg-theme-base border border-theme">--:--</span>`;

      const rowBg = isKept 
        ? "bg-theme-surface border-theme hover:bg-theme-base" 
        : "bg-theme-low/20 border-rose-500/20 opacity-55 hover:opacity-75";

      return `
        <div class="arc-chap-row flex items-center justify-between p-2.5 rounded-xl border ${rowBg} transition-all cursor-pointer select-none" data-ep-idx="${epIdx}" data-c-idx="${cIdx}">
          <div class="flex items-center gap-2.5 min-w-0">
            <input type="checkbox" class="w-4 h-4 rounded text-accent focus:ring-0 cursor-pointer pointer-events-none" ${isKept ? 'checked' : ''}>
            <div class="shrink-0">
              ${movieTimestampBadge}
            </div>
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                ${titlePt}
                ${typeBadge}
              </div>
              <span class="text-[11px] font-mono text-theme-muted mt-0.5">Original: ${epTimeRange} (${durFormatted})</span>
            </div>
          </div>
          <div class="shrink-0 ml-2">
            ${statusBadge}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="bg-theme-low/40 rounded-xl border border-theme p-3 space-y-2">
        <div class="flex items-center justify-between pb-1 border-b border-theme/60">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-accent-wash text-accent border border-accent-subtle">${ep.display_code}</span>
            <span class="text-xs font-semibold text-theme-main">${ep.title || ep.file_name}</span>
          </div>
          <span class="text-[11px] font-mono text-theme-muted">Início no Filme: <strong class="text-theme-main">${ep.movie_offset_formatted}</strong></span>
        </div>
        <div class="space-y-1.5">
          ${epChapsHtml || '<p class="text-xs text-theme-muted p-2">Sem capítulos cadastrados neste episódio.</p>'}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".arc-chap-row").forEach(row => {
    row.addEventListener("click", () => {
      const epIdx = parseInt(row.getAttribute("data-ep-idx"));
      const cIdx = parseInt(row.getAttribute("data-c-idx"));
      const ep = state.tempArcData.episodes[epIdx];
      if (ep && ep.chapters && ep.chapters[cIdx]) {
        ep.chapters[cIdx].kept = !ep.chapters[cIdx].kept;
        renderModalArcChaptersList();
      }
    });
  });

  updateModalArcChaptersSummary();
}

function updateModalArcChaptersSummary() {
  if (!state.tempArcData) return;

  const epsCount = (state.tempArcData.episodes || []).length;
  const totalChaps = state.tempArcData.total_chapters || 0;
  const keptChaps = state.tempArcData.kept_chapters || 0;
  const finalDur = state.tempArcData.total_movie_duration_formatted || "00m 00s";

  document.getElementById("arc-chap-modal-eps-count").textContent = epsCount;
  document.getElementById("arc-chap-modal-chaps-count").textContent = `${keptChaps} / ${totalChaps}`;
  document.getElementById("arc-chap-modal-final-dur").textContent = finalDur;

  let origTotalSec = 0;
  (state.tempArcData.episodes || []).forEach(ep => {
    origTotalSec += ep.duration_seconds || 0;
  });
  const currentTotalSec = state.tempArcData.total_movie_duration_seconds || 0;
  const cutSec = Math.max(0, origTotalSec - currentTotalSec);

  const diffBadge = document.getElementById("arc-chap-modal-diff-badge");
  if (cutSec > 0.5) {
    diffBadge.textContent = `-${formatSecondsToTime(cutSec)} cortados do filme`;
    diffBadge.className = "text-[11px] px-2 py-0.5 rounded-full font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30";
  } else {
    diffBadge.textContent = "Sem cortes (Integral)";
    diffBadge.className = "text-[11px] px-2 py-0.5 rounded-full font-mono bg-theme-base text-theme-muted border border-theme";
  }
}

function onSelectAllArcChapters() {
  if (!state.tempArcData || !state.tempArcData.episodes) return;
  state.tempArcData.episodes.forEach(ep => {
    (ep.chapters || []).forEach(c => {
      c.kept = true;
    });
  });
  renderModalArcChaptersList();
}

function onPresetStripOpEdArc() {
  if (!state.tempArcData || !state.tempArcData.episodes) return;
  const arc = state.activeArcForChapters;
  const totalEps = state.tempArcData.episodes.length;

  state.tempArcData.episodes.forEach((ep, idx) => {
    const isFirst = (idx === 0);
    const isLast = (idx === totalEps - 1);
    const keepOp = Boolean(arc?.keep_first_op && isFirst);
    const keepEd = Boolean(arc?.keep_last_ed && isLast);

    (ep.chapters || []).forEach(c => {
      if ((c.is_op && !keepOp) || (c.is_ed && !keepEd)) {
        c.kept = false;
      } else {
        c.kept = true;
      }
    });
  });
  renderModalArcChaptersList();
}

async function onTranslateArcChapters() {
  const arc = state.activeArcForChapters;
  if (!arc) return;

  const btn = document.getElementById("btn-arc-chap-translate");
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<span>⏳</span> Traduzindo Capítulos...`;
  btn.disabled = true;

  try {
    const api = await getApi();
    const res = await api.translate_arc_chapters(arc, true);
    if (res && res.success) {
      state.tempArcData = res;
      renderModalArcChaptersList();
    } else {
      alert(`Aviso ao traduzir: ${res?.error || "Falha na tradução"}`);
    }
  } catch (err) {
    alert(`Erro ao traduzir capítulos do filme: ${err}`);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

async function onApplyArcChaptersToMkv() {
  const arc = state.activeArcForChapters;
  if (!arc) return;

  if (!confirm(`Deseja gravar os capítulos traduzidos diretamente em todos os ${arc.episode_paths.length} arquivos MKV de origem deste filme?\n\nIsso usa o mkvpropedit de forma lossless instantânea sem modificar os fluxos de vídeo e áudio.`)) {
    return;
  }

  const btn = document.getElementById("btn-arc-chap-apply-mkv");
  const origHtml = btn.innerHTML;
  btn.innerHTML = `<span>⏳</span> Gravando nos MKVs...`;
  btn.disabled = true;

  try {
    const api = await getApi();
    await api.save_arc_chapters_selection(arc, state.tempArcData.episodes);
    const res = await api.apply_arc_chapters_to_files(arc, true);
    if (res && res.success) {
      alert(`✅ Sucesso!\n${res.message || 'Capítulos gravados nos arquivos MKV!'}`);
    } else {
      alert(`❌ Erro ao gravar: ${res?.error || 'Falha ao executar mkvpropedit'}`);
    }
  } catch (err) {
    alert(`Erro: ${err}`);
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

async function onSaveArcChaptersSettings() {
  const arc = state.activeArcForChapters;
  if (!arc || !state.tempArcData) return;

  const isDetailed = document.getElementById("arc-chap-toggle-detailed").checked;
  arc.detailed_chapters = isDetailed;

  const api = await getApi();
  await api.save_arc_chapters_selection(arc, state.tempArcData.episodes);

  (state.tempArcData.episodes || []).forEach(remoteEp => {
    const localEp = state.episodes.find(e => e.file_path === remoteEp.file_path);
    if (localEp && remoteEp.chapters) {
      localEp.chapters = remoteEp.chapters;
    }
  });

  arc.estimated_duration = state.tempArcData.total_movie_duration_formatted;

  closeModalArcChapters();
  renderArcs();
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
