const ALL_VALUE = "all";
const PAGE_SIZE = 80;
const STEP_CHUNKS_PER_BATCH = 12;

const state = {
  manifest: null,
  loadedSteps: new Map(),
  loading: new Map(),
  promptValue: ALL_VALUE,
  trialValue: ALL_VALUE,
  stepValue: ALL_VALUE,
  resultSession: 0,
  resultStepIndexes: [],
  resultChunkCursor: 0,
  pendingItems: [],
  renderedCount: 0,
  scannedChunkCount: 0,
  isLoadingBatch: false
};

const els = {
  runTitle: document.getElementById("runTitle"),
  currentStepLabel: document.getElementById("currentStepLabel"),
  checkpointCounter: document.getElementById("checkpointCounter"),
  loadError: document.getElementById("loadError"),
  modelName: document.getElementById("modelName"),
  checkpointCount: document.getElementById("checkpointCount"),
  itemCount: document.getElementById("itemCount"),
  selectionSummary: document.getElementById("selectionSummary"),
  promptSelect: document.getElementById("promptSelect"),
  trialSelect: document.getElementById("trialSelect"),
  stepSelect: document.getElementById("stepSelect"),
  promptRange: document.getElementById("promptRange"),
  trialRange: document.getElementById("trialRange"),
  stepRange: document.getElementById("stepRange"),
  promptValueLabel: document.getElementById("promptValueLabel"),
  trialValueLabel: document.getElementById("trialValueLabel"),
  stepValueLabel: document.getElementById("stepValueLabel"),
  promptMinLabel: document.getElementById("promptMinLabel"),
  trialMinLabel: document.getElementById("trialMinLabel"),
  stepMinLabel: document.getElementById("stepMinLabel"),
  promptFigureMount: document.getElementById("promptFigureMount"),
  figureMount: document.getElementById("figureMount"),
  resultTitle: document.getElementById("resultTitle"),
  resultSummary: document.getElementById("resultSummary"),
  resultList: document.getElementById("resultList"),
  loadMoreButton: document.getElementById("loadMoreButton")
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

function promptValues() {
  return state.manifest.prompts.map((prompt) => String(prompt.id)).concat(ALL_VALUE);
}

function trialValues() {
  return state.manifest.trials.map((trial) => String(trial)).concat(ALL_VALUE);
}

function stepValues() {
  return state.manifest.chunks.map((chunk) => String(chunk.step)).concat(ALL_VALUE);
}

function controlValues(kind) {
  if (kind === "prompt") {
    return promptValues();
  }
  if (kind === "trial") {
    return trialValues();
  }
  return stepValues();
}

function controlElements(kind) {
  if (kind === "prompt") {
    return {
      select: els.promptSelect,
      range: els.promptRange,
      label: els.promptValueLabel
    };
  }
  if (kind === "trial") {
    return {
      select: els.trialSelect,
      range: els.trialRange,
      label: els.trialValueLabel
    };
  }
  return {
    select: els.stepSelect,
    range: els.stepRange,
    label: els.stepValueLabel
  };
}

function controlStateKey(kind) {
  return `${kind}Value`;
}

function labelForValue(kind, value) {
  if (value === ALL_VALUE) {
    if (kind === "prompt") {
      return "All prompts";
    }
    if (kind === "trial") {
      return "All trials";
    }
    return "All steps";
  }

  if (kind === "prompt") {
    return `Prompt ${value}`;
  }
  if (kind === "trial") {
    return `Trial ${value}`;
  }
  return `Step ${compactNumber(Number(value))}`;
}

function optionLabelForValue(kind, value) {
  if (value === ALL_VALUE) {
    return labelForValue(kind, value);
  }

  if (kind === "prompt") {
    const prompt = state.manifest.prompts.find((entry) => String(entry.id) === String(value));
    return `Prompt ${value}: ${shortText(prompt ? prompt.text : "", 70)}`;
  }

  return labelForValue(kind, value);
}

function setRangeFill(range) {
  const max = Math.max(1, Number(range.max));
  const pct = Math.round((Number(range.value) / max) * 100);
  range.style.background = `linear-gradient(90deg, var(--accent) ${pct}%, #d6ddd8 ${pct}%)`;
}

function sliderIndexToValue(kind, index) {
  const values = controlValues(kind);
  const safeIndex = Math.max(0, Math.min(Number(index), values.length - 1));
  return values[safeIndex];
}

function valueToSliderIndex(kind, value) {
  const values = controlValues(kind);
  const index = values.indexOf(String(value));
  return index >= 0 ? index : 0;
}

function syncControl(kind) {
  const value = state[controlStateKey(kind)];
  const { select, range, label } = controlElements(kind);
  const sliderIndex = valueToSliderIndex(kind, value);

  select.value = value;
  range.value = String(sliderIndex);
  label.textContent = labelForValue(kind, value);
  setRangeFill(range);
}

function setControl(kind, value, options = {}) {
  state[controlStateKey(kind)] = String(value);
  syncControl(kind);

  if (kind === "prompt") {
    renderPromptFigure();
  }

  updateSelectionStatus();

  if (options.render !== false) {
    startResultRender();
  }
}

function populateOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function populateControl(kind) {
  const { select, range } = controlElements(kind);
  const values = controlValues(kind);
  select.innerHTML = "";
  values.forEach((value) => {
    populateOption(select, value, optionLabelForValue(kind, value));
  });
  range.max = String(values.length - 1);
  range.value = "0";
}

function defaultStepValue() {
  const firstChunk = state.manifest.chunks[0];
  return firstChunk ? String(firstChunk.step) : ALL_VALUE;
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

  populateControl("prompt");
  populateControl("trial");
  populateControl("step");

  els.promptMinLabel.textContent = labelForValue("prompt", promptValues()[0] || "0");
  els.trialMinLabel.textContent = labelForValue("trial", trialValues()[0] || "0");
  els.stepMinLabel.textContent = labelForValue("step", stepValues()[0] || "0");

  state.promptValue = manifest.defaults.prompt_id !== null && manifest.defaults.prompt_id !== undefined
    ? String(manifest.defaults.prompt_id)
    : ALL_VALUE;
  state.trialValue = manifest.defaults.trial_id !== null && manifest.defaults.trial_id !== undefined
    ? String(manifest.defaults.trial_id)
    : ALL_VALUE;
  state.stepValue = defaultStepValue();

  syncControl("prompt");
  syncControl("trial");
  syncControl("step");
  updateSelectionStatus();
}

function selectedLabels() {
  return [
    labelForValue("prompt", state.promptValue),
    labelForValue("trial", state.trialValue),
    labelForValue("step", state.stepValue)
  ];
}

function selectedMatchEstimate() {
  const promptCount = state.promptValue === ALL_VALUE ? state.manifest.prompts.length : 1;
  const trialCount = state.trialValue === ALL_VALUE ? state.manifest.trials.length : 1;
  const stepCount = state.stepValue === ALL_VALUE ? state.manifest.chunks.length : 1;
  return promptCount * trialCount * stepCount;
}

function updateSelectionStatus() {
  const labels = selectedLabels();
  const estimate = selectedMatchEstimate();
  const allCount = [state.promptValue, state.trialValue, state.stepValue]
    .filter((value) => value === ALL_VALUE).length;

  els.currentStepLabel.textContent = labels.join(" · ");
  els.checkpointCounter.textContent = `${compactNumber(estimate)} matching responses`;
  els.resultTitle.textContent = allCount === 0 ? "Selected Response" : "Selected Responses";
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

  if (state.promptValue === ALL_VALUE) {
    els.promptFigureMount.appendChild(makeEl("div", "empty-state", "All prompts selected."));
    return;
  }

  const promptFigures = state.manifest.prompt_figures || {};
  const figure = promptFigures[state.promptValue];
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
  image.alt = figure.label || `ln_trace summary for prompt ${state.promptValue}`;
  image.loading = "lazy";

  const caption = makeEl(
    "figcaption",
    "",
    figure.label || `ln_trace summary for prompt ${state.promptValue}`
  );
  link.appendChild(image);
  wrapper.append(link, caption);
  els.promptFigureMount.appendChild(wrapper);
}

function selectedStepIndexes() {
  if (state.stepValue === ALL_VALUE) {
    return state.manifest.chunks.map((_, index) => index);
  }

  const index = state.manifest.chunks.findIndex((chunk) => String(chunk.step) === state.stepValue);
  return index >= 0 ? [index] : [];
}

function itemMatchesControls(item) {
  if (state.promptValue !== ALL_VALUE && String(item.prompt_id) !== state.promptValue) {
    return false;
  }
  if (state.trialValue !== ALL_VALUE && String(item.trial_id) !== state.trialValue) {
    return false;
  }
  return true;
}

function loadStepData(index) {
  const chunk = state.manifest.chunks[index];
  if (!chunk) {
    return Promise.resolve(null);
  }
  if (state.loadedSteps.has(chunk.step)) {
    return Promise.resolve(state.loadedSteps.get(chunk.step));
  }
  if (state.loading.has(chunk.step)) {
    return state.loading.get(chunk.step);
  }

  const promise = fetchJson(chunk.path)
    .then((data) => {
      state.loadedSteps.set(chunk.step, data);
      return data;
    })
    .finally(() => {
      state.loading.delete(chunk.step);
    });

  state.loading.set(chunk.step, promise);
  return promise;
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
  tags.appendChild(makeEl("span", "tag accent", `Step ${compactNumber(item.step)}`));
  tags.appendChild(makeEl("span", "tag", `Prompt ${item.prompt_id}`));
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

function appendResultItems(items) {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    fragment.appendChild(renderItem(item));
  });
  els.resultList.appendChild(fragment);
}

function updateResultSummary() {
  const estimate = selectedMatchEstimate();
  const totalSteps = state.resultStepIndexes.length;
  const scannedSteps = state.scannedChunkCount;
  const stepPart = state.stepValue === ALL_VALUE
    ? `${compactNumber(scannedSteps)} of ${compactNumber(totalSteps)} step chunks scanned`
    : `${compactNumber(totalSteps)} step chunk scanned`;

  els.resultSummary.textContent =
    `${compactNumber(state.renderedCount)} of ${compactNumber(estimate)} shown · ${stepPart}`;
}

function setLoadMoreState(hasMore) {
  els.loadMoreButton.hidden = !hasMore;
  els.loadMoreButton.disabled = state.isLoadingBatch;
  els.loadMoreButton.textContent = state.isLoadingBatch ? "Loading..." : "Load more";
}

function resetResultState() {
  state.resultStepIndexes = selectedStepIndexes();
  state.resultChunkCursor = 0;
  state.pendingItems = [];
  state.renderedCount = 0;
  state.scannedChunkCount = 0;
  state.isLoadingBatch = false;
  els.resultList.innerHTML = "";
  setLoadMoreState(false);
  updateResultSummary();
}

async function loadMoreResults(session = state.resultSession) {
  if (state.isLoadingBatch) {
    return;
  }

  state.isLoadingBatch = true;
  setLoadMoreState(true);

  try {
    let chunksLoaded = 0;
    while (
      state.pendingItems.length < PAGE_SIZE &&
      state.resultChunkCursor < state.resultStepIndexes.length &&
      chunksLoaded < STEP_CHUNKS_PER_BATCH
    ) {
      const stepIndex = state.resultStepIndexes[state.resultChunkCursor];
      state.resultChunkCursor += 1;
      chunksLoaded += 1;

      const data = await loadStepData(stepIndex);
      if (session !== state.resultSession) {
        return;
      }
      if (!data) {
        continue;
      }

      const chunk = state.manifest.chunks[stepIndex];
      const matches = data.items
        .filter(itemMatchesControls)
        .map((item) => ({
          ...item,
          step: chunk.step,
          step_index: stepIndex
        }));
      state.pendingItems.push(...matches);
      state.scannedChunkCount += 1;
    }

    const batch = state.pendingItems.splice(0, PAGE_SIZE);
    appendResultItems(batch);
    state.renderedCount += batch.length;
  } catch (error) {
    if (session === state.resultSession) {
      els.resultList.appendChild(makeEl("div", "empty-state", `Could not load selected responses: ${error.message}`));
    }
  } finally {
    if (session !== state.resultSession) {
      return;
    }

    state.isLoadingBatch = false;
    const hasMore = state.pendingItems.length > 0 || state.resultChunkCursor < state.resultStepIndexes.length;
    setLoadMoreState(hasMore);
    updateResultSummary();

    if (state.renderedCount === 0 && !hasMore && !els.resultList.children.length) {
      els.resultList.appendChild(makeEl("div", "empty-state", "No exported responses match the current controls."));
    }
  }
}

function startResultRender() {
  state.resultSession += 1;
  const session = state.resultSession;
  resetResultState();
  loadMoreResults(session);
}

function setupEvents() {
  els.promptSelect.addEventListener("change", (event) => {
    setControl("prompt", event.target.value);
  });
  els.promptRange.addEventListener("input", (event) => {
    setControl("prompt", sliderIndexToValue("prompt", event.target.value));
  });

  els.trialSelect.addEventListener("change", (event) => {
    setControl("trial", event.target.value);
  });
  els.trialRange.addEventListener("input", (event) => {
    setControl("trial", sliderIndexToValue("trial", event.target.value));
  });

  els.stepSelect.addEventListener("change", (event) => {
    setControl("step", event.target.value);
  });
  els.stepRange.addEventListener("input", (event) => {
    setControl("step", sliderIndexToValue("step", event.target.value));
  });

  els.loadMoreButton.addEventListener("click", () => {
    loadMoreResults(state.resultSession);
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
  setupEvents();
  startResultRender();
}

init();
