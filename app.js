const state = {
  manifest: null,
  loadedSteps: new Map(),
  currentIndex: 0,
  promptFilter: "all",
  trialFilter: "all",
  stepFilter: "all",
  loading: new Map()
};

const els = {
  runTitle: document.getElementById("runTitle"),
  currentStepLabel: document.getElementById("currentStepLabel"),
  checkpointCounter: document.getElementById("checkpointCounter"),
  stepRange: document.getElementById("stepRange"),
  loadError: document.getElementById("loadError"),
  modelName: document.getElementById("modelName"),
  checkpointCount: document.getElementById("checkpointCount"),
  itemCount: document.getElementById("itemCount"),
  selectionSummary: document.getElementById("selectionSummary"),
  promptSelect: document.getElementById("promptSelect"),
  trialSelect: document.getElementById("trialSelect"),
  stepSelect: document.getElementById("stepSelect"),
  promptFigureMount: document.getElementById("promptFigureMount"),
  figureMount: document.getElementById("figureMount"),
  stepMount: document.getElementById("stepMount")
};

function compactNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortText(value, maxLength = 82) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 3)}...`;
}

function makeEl(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function setError(message) {
  els.loadError.hidden = false;
  els.loadError.textContent = message;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function currentChunk() {
  return state.manifest.chunks[state.currentIndex];
}

function updateProgress(index) {
  const chunk = state.manifest.chunks[index];
  if (!chunk) {
    return;
  }

  state.currentIndex = index;
  els.stepRange.value = String(index);
  els.currentStepLabel.textContent = `Step ${compactNumber(chunk.step)}`;
  els.checkpointCounter.textContent = `${index + 1} / ${state.manifest.chunks.length}`;

  const max = Math.max(1, state.manifest.chunks.length - 1);
  const pct = Math.round((index / max) * 100);
  els.stepRange.style.background = `linear-gradient(90deg, var(--accent) ${pct}%, #d6ddd8 ${pct}%)`;

  document.querySelectorAll(".step-section.is-current").forEach((node) => {
    node.classList.remove("is-current");
  });
  const section = document.querySelector(`[data-step-index="${index}"]`);
  if (section) {
    section.classList.add("is-current");
  }
}

function populateOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function renderMeta() {
  const manifest = state.manifest;
  els.runTitle.textContent = manifest.run_label || "Generation checkpoints";
  els.modelName.textContent = manifest.model || "--";
  els.checkpointCount.textContent = compactNumber(manifest.summary.checkpoint_count);
  els.itemCount.textContent = compactNumber(manifest.summary.item_count);
  els.selectionSummary.textContent =
    `${manifest.summary.prompt_count} prompts, ${manifest.summary.trial_count} trials`;

  document.title = `${manifest.run_label || "LLM-LDS"} | Generation Viewer`;

  els.promptSelect.innerHTML = "";
  populateOption(els.promptSelect, "all", "All included prompts");
  manifest.prompts.forEach((prompt) => {
    populateOption(
      els.promptSelect,
      String(prompt.id),
      `Prompt ${prompt.id}: ${shortText(prompt.text, 70)}`
    );
  });

  const defaultPrompt = manifest.defaults.prompt_id;
  if (defaultPrompt !== null && defaultPrompt !== undefined) {
    els.promptSelect.value = String(defaultPrompt);
    state.promptFilter = String(defaultPrompt);
  }

  els.trialSelect.innerHTML = "";
  populateOption(els.trialSelect, "all", "All included trials");
  manifest.trials.forEach((trial) => {
    populateOption(els.trialSelect, String(trial), `Trial ${trial}`);
  });

  const defaultTrial = manifest.defaults.trial_id;
  if (defaultTrial !== null && defaultTrial !== undefined) {
    els.trialSelect.value = String(defaultTrial);
    state.trialFilter = String(defaultTrial);
  }

  els.stepSelect.innerHTML = "";
  populateOption(els.stepSelect, "all", "All steps");
  manifest.chunks.forEach((chunk) => {
    populateOption(els.stepSelect, String(chunk.step), `Step ${compactNumber(chunk.step)}`);
  });
  els.stepSelect.value = "all";
  state.stepFilter = "all";

  els.stepRange.max = String(Math.max(0, manifest.chunks.length - 1));
  els.stepRange.value = "0";
}

function renderFigures() {
  els.figureMount.innerHTML = "";
  const figures = state.manifest.figures || [];
  if (!figures.length) {
    els.figureMount.appendChild(makeEl("div", "empty-state", "No metric figures found."));
    return;
  }

  figures.forEach((figure) => {
    const wrapper = makeEl("figure", "figure metric-figure");
    const link = document.createElement("a");
    link.href = figure.path;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = "Open full-size figure";

    const image = document.createElement("img");
    image.src = figure.path;
    image.alt = figure.label;
    image.loading = "lazy";

    const caption = makeEl("figcaption", "", figure.label);
    link.appendChild(image);
    wrapper.append(link, caption);
    els.figureMount.appendChild(wrapper);
  });
}

function renderPromptFigure() {
  els.promptFigureMount.innerHTML = "";

  if (state.promptFilter === "all") {
    els.promptFigureMount.appendChild(makeEl("div", "empty-state", "Choose one prompt to view its ln_trace summary."));
    return;
  }

  const promptFigures = state.manifest.prompt_figures || {};
  const figure = promptFigures[state.promptFilter];
  if (!figure) {
    els.promptFigureMount.appendChild(makeEl("div", "empty-state", "No ln_trace summary figure found for this prompt."));
    return;
  }

  const wrapper = makeEl("figure", "figure prompt-figure");
  const link = document.createElement("a");
  link.href = figure.path;
  link.target = "_blank";
  link.rel = "noopener";
  link.title = "Open full-size figure";

  const image = document.createElement("img");
  image.src = figure.path;
  image.alt = figure.label || `ln_trace summary for prompt ${state.promptFilter}`;
  image.loading = "lazy";

  const caption = makeEl(
    "figcaption",
    "",
    figure.label || `ln_trace summary for prompt ${state.promptFilter}`
  );
  link.appendChild(image);
  wrapper.append(link, caption);
  els.promptFigureMount.appendChild(wrapper);
}

function createStepSections() {
  els.stepMount.innerHTML = "";
  state.manifest.chunks.forEach((chunk, index) => {
    const section = makeEl("section", "step-section is-pending");
    section.id = `step-${chunk.step}`;
    section.dataset.stepIndex = String(index);

    const heading = makeEl("div", "step-heading");
    const title = makeEl("h2", "", `Step ${compactNumber(chunk.step)}`);
    const meta = makeEl(
      "div",
      "step-meta",
      `${compactNumber(chunk.item_count)} exported items`
    );
    heading.append(title, meta);

    const content = makeEl("div", "step-content");
    content.appendChild(makeEl("div", "status-line", "Waiting"));

    section.append(heading, content);
    els.stepMount.appendChild(section);
  });
}

function itemMatchesFilters(item) {
  if (state.promptFilter !== "all" && String(item.prompt_id) !== state.promptFilter) {
    return false;
  }
  if (state.trialFilter !== "all" && String(item.trial_id) !== state.trialFilter) {
    return false;
  }
  return true;
}

function renderTextBlock(className, title, text) {
  const block = makeEl("div", `text-block ${className}`);
  block.appendChild(makeEl("h3", "", title));
  const pre = document.createElement("pre");
  pre.textContent = text || "";
  block.appendChild(pre);
  return block;
}

function renderItem(item) {
  const article = makeEl("article", "generation-card");

  const head = makeEl("div", "generation-head");
  const tags = makeEl("div", "tag-row");
  tags.appendChild(makeEl("span", "tag accent", `Prompt ${item.prompt_id}`));
  tags.appendChild(makeEl("span", "tag warm", `Trial ${item.trial_id}`));
  if (item.truncated) {
    tags.appendChild(makeEl("span", "tag", "Truncated"));
  }

  const charCount = makeEl(
    "div",
    "char-count",
    `${compactNumber(item.generated_chars || 0)} generated chars`
  );
  head.append(tags, charCount);

  article.appendChild(head);
  article.appendChild(renderTextBlock("prompt", "Prompt", item.prompt));
  article.appendChild(renderTextBlock("generated", "Generated", item.generated));
  return article;
}

function renderStep(section, data) {
  section.classList.remove("is-pending");
  const content = section.querySelector(".step-content");
  content.innerHTML = "";

  const filtered = data.items.filter(itemMatchesFilters);
  const headingMeta = section.querySelector(".step-meta");
  headingMeta.textContent = `${compactNumber(filtered.length)} visible of ${compactNumber(data.items.length)} exported`;

  if (!filtered.length) {
    content.appendChild(makeEl("div", "empty-state", "No exported items match the current filters."));
    return;
  }

  const list = makeEl("div", "generation-list");
  filtered.forEach((item) => {
    list.appendChild(renderItem(item));
  });
  content.appendChild(list);
}

function loadStep(index) {
  const chunk = state.manifest.chunks[index];
  if (!chunk || state.loadedSteps.has(chunk.step)) {
    return Promise.resolve();
  }
  if (state.loading.has(chunk.step)) {
    return state.loading.get(chunk.step);
  }

  const section = document.querySelector(`[data-step-index="${index}"]`);
  const content = section.querySelector(".step-content");
  content.innerHTML = "";
  content.appendChild(makeEl("div", "status-line", "Loading"));

  const promise = (async () => {
    try {
      const data = await fetchJson(chunk.path);
      state.loadedSteps.set(chunk.step, data);
      renderStep(section, data);
    } catch (error) {
      content.innerHTML = "";
      content.appendChild(makeEl("div", "empty-state", `Could not load step ${chunk.step}: ${error.message}`));
    } finally {
      state.loading.delete(chunk.step);
    }
  })();

  state.loading.set(chunk.step, promise);
  return promise;
}

function rerenderLoadedSteps() {
  state.manifest.chunks.forEach((chunk, index) => {
    const data = state.loadedSteps.get(chunk.step);
    if (!data) {
      return;
    }
    const section = document.querySelector(`[data-step-index="${index}"]`);
    renderStep(section, data);
  });
}

// Step filter hides every checkpoint section except the chosen one (or shows
// all). Only the visible step needs to be loaded, so it stays cheap.
function applyStepFilter() {
  const sections = document.querySelectorAll(".step-section");
  if (state.stepFilter === "all") {
    sections.forEach((section) => section.classList.remove("is-hidden"));
    return;
  }

  sections.forEach((section) => {
    const index = Number(section.dataset.stepIndex);
    const chunk = state.manifest.chunks[index];
    if (String(chunk.step) === state.stepFilter) {
      section.classList.remove("is-hidden");
      loadStep(index);
      updateProgress(index);
    } else {
      section.classList.add("is-hidden");
    }
  });
}

function applyFilters() {
  applyStepFilter();
  rerenderLoadedSteps();
}

function setupObservers() {
  const lazyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const index = Number(entry.target.dataset.stepIndex);
        loadStep(index);
      });
    },
    { rootMargin: "900px 0px 1200px 0px" }
  );

  const activeObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
      if (!visible.length) {
        return;
      }
      const index = Number(visible[0].target.dataset.stepIndex);
      updateProgress(index);
    },
    { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.2, 0.6] }
  );

  document.querySelectorAll(".step-section").forEach((section) => {
    lazyObserver.observe(section);
    activeObserver.observe(section);
  });
}

async function scrollToStep(index) {
  const section = document.querySelector(`[data-step-index="${index}"]`);
  if (!section) {
    return;
  }
  updateProgress(index);
  await loadStep(index);
  section.scrollIntoView({ block: "start", behavior: "smooth" });
}

function setupEvents() {
  els.stepRange.addEventListener("input", (event) => {
    // Scrubbing the slider only makes sense across all steps, so leave
    // single-step mode if it's active.
    if (state.stepFilter !== "all") {
      state.stepFilter = "all";
      els.stepSelect.value = "all";
      applyStepFilter();
    }
    scrollToStep(Number(event.target.value));
  });

  els.promptSelect.addEventListener("change", (event) => {
    state.promptFilter = event.target.value;
    renderPromptFigure();
    applyFilters();
  });

  els.trialSelect.addEventListener("change", (event) => {
    state.trialFilter = event.target.value;
    applyFilters();
  });

  els.stepSelect.addEventListener("change", (event) => {
    state.stepFilter = event.target.value;
    applyFilters();
  });
}

async function init() {
  try {
    state.manifest = await fetchJson("data/manifest.json");
  } catch (error) {
    setError(`Could not load data/manifest.json: ${error.message}`);
    return;
  }

  renderMeta();
  renderPromptFigure();
  renderFigures();
  createStepSections();
  setupEvents();
  setupObservers();
  updateProgress(0);
  loadStep(0);
}

init();
