(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    fileInput: $("#fileInput"),
    dropzone: $("#dropzone"),
    editor: $("#editor"),
    studio: $("#studio"),
    fileName: $("#fileName"),
    fileDetails: $("#fileDetails"),
    sourceVideo: $("#sourceVideo"),
    previewCanvas: $("#previewCanvas"),
    canvasStage: $("#canvasStage"),
    canvasLabel: $("#canvasLabel"),
    canvasHelp: $("#canvasHelp"),
    playPauseButton: $("#playPauseButton"),
    scrubber: $("#scrubber"),
    timeDisplay: $("#timeDisplay"),
    durationDisplay: $("#durationDisplay"),
    metadataSummary: $("#metadataSummary"),
    metadataMeter: $("#metadataMeter"),
    metadataBlocks: $("#metadataBlocks"),
    metadataSize: $("#metadataSize"),
    outputWidth: $("#outputWidth"),
    outputHeight: $("#outputHeight"),
    lockRatio: $("#lockRatio"),
    outputFormat: $("#outputFormat"),
    outputQuality: $("#outputQuality"),
    bitrateOutput: $("#bitrateOutput"),
    qualityControl: $("#qualityControl"),
    includeAudio: $("#includeAudio"),
    redactionStrength: $("#redactionStrength"),
    strengthOutput: $("#strengthOutput"),
    strengthControl: $("#strengthControl"),
    undoRedaction: $("#undoRedaction"),
    clearRedactions: $("#clearRedactions"),
    privateFilename: $("#privateFilename"),
    compareButton: $("#compareButton"),
    downloadButton: $("#downloadButton"),
    exportStatus: $("#exportStatus"),
    outputEstimate: $("#outputEstimate"),
    toast: $("#toast"),
    menuToggle: $("#menuToggle"),
    mainNav: $("#mainNav")
  };

  const SUPPORTED_TYPES = new Set([
    "video/mp4",
    "video/quicktime",
    "video/x-m4v",
    "video/webm",
    "video/ogg",
    "application/ogg",
    "video/mpeg"
  ]);

  const OUTPUT_FORMATS = [
    { label: "MP4 (H.264)", mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", fallback: ["video/mp4;codecs=avc1", "video/mp4"] },
    { label: "WebM (VP9)", mime: "video/webm;codecs=vp9,opus", fallback: ["video/webm;codecs=vp9", "video/webm"] },
    { label: "WebM (AV1)", mime: "video/webm;codecs=av01.0.05M.08,opus", fallback: ["video/webm;codecs=av01.0.05M.08", "video/webm"] },
    { label: "WebM (VP8)", mime: "video/webm;codecs=vp8,opus", fallback: ["video/webm;codecs=vp8", "video/webm"] }
  ];

  const state = {
    file: null,
    video: null,
    sourceUrl: null,
    originalWidth: 0,
    originalHeight: 0,
    duration: 0,
    aspectRatio: 1,
    metadata: { count: 0, bytes: 0, labels: [] },
    activePanel: "privacy",
    redactionMode: "pixelate",
    redactions: [],
    drawing: false,
    selection: null,
    comparing: false,
    exportInProgress: false,
    playing: false,
    previewRaf: null,
    exportRaf: null,
    resizeFrame: null
  };

  const canvasContext = elements.previewCanvas.getContext("2d", { alpha: true });
  let toastTimer = null;

  function init() {
    initNavigation();
    initRevealAnimations();
    initUploader();
    initToolPanels();
    initRedactionControls();
    initAdjustmentControls();
    initPlayerControls();
    initCanvasInteractions();
    initExportControls();
    initCanvasRedactToolbar();
    initOutputFormats();
    updateRange(elements.outputQuality, elements.qualityControl);
    $("#currentYear").textContent = new Date().getFullYear();

    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // The editor remains fully functional even when offline caching is unavailable.
      });
    }

    if (new URLSearchParams(location.search).has("debug")) {
      window.__sVideoTest = {
        scanMetadata,
        sanitizeEncodedBlob,
        stripIsoBmffMetadata,
        stripWebMMetadata,
        formatBytes,
        formatTime
      };
    }
  }

  function initNavigation() {
    elements.menuToggle.addEventListener("click", () => {
      const open = elements.menuToggle.getAttribute("aria-expanded") === "true";
      elements.menuToggle.setAttribute("aria-expanded", String(!open));
      elements.mainNav.classList.toggle("open", !open);
    });

    $$("#mainNav a").forEach((link) => {
      link.addEventListener("click", () => {
        elements.menuToggle.setAttribute("aria-expanded", "false");
        elements.mainNav.classList.remove("open");
      });
    });
  }

  function initRevealAnimations() {
    const items = $$(".reveal");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.11 });

    items.forEach((item) => observer.observe(item));
  }

  function initUploader() {
    $$("[data-open-file]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        elements.fileInput.click();
      });
    });

    elements.fileInput.addEventListener("change", () => {
      const [file] = elements.fileInput.files;
      if (file) loadVideoFile(file);
    });

    elements.dropzone.addEventListener("click", () => elements.fileInput.click());
    elements.dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        elements.fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      elements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropzone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      elements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropzone.classList.remove("dragging");
      });
    });

    elements.dropzone.addEventListener("drop", (event) => {
      const [file] = event.dataTransfer.files;
      if (file) loadVideoFile(file);
    });

    $("#closeImage").addEventListener("click", closeVideo);
    $("#changeImage").addEventListener("click", () => elements.fileInput.click());
  }

  async function loadVideoFile(file) {
    if (!SUPPORTED_TYPES.has(file.type)) {
      showToast("Unsupported format. Use MP4, MOV, WebM, or OGG.", true);
      return;
    }

    if (file.size > 200 * 1024 * 1024) {
      showToast("Large file: processing may use significant memory.");
    }

    setExportStatus("Reading video locally", "The file stays on your device");

    try {
      const [video, buffer] = await Promise.all([
        createVideoFromFile(file),
        file.arrayBuffer()
      ]);

      releaseSourceUrl();
      state.file = file;
      state.video = video;
      state.sourceUrl = video.dataset.objectUrl || null;
      state.originalWidth = video.videoWidth;
      state.originalHeight = video.videoHeight;
      state.duration = Number.isFinite(video.duration) ? video.duration : 0;
      state.aspectRatio = video.videoWidth / video.videoHeight;
      state.metadata = scanMetadata(buffer, file.type);
      state.redactions = [];
      state.selection = null;
      state.drawing = false;
      state.playing = false;

      elements.fileName.textContent = file.name;
      elements.fileDetails.textContent = `${formatNumber(video.videoWidth)} × ${formatNumber(video.videoHeight)} • ${formatBytes(file.size)} • ${formatTime(state.duration)}`;
      elements.outputWidth.value = video.videoWidth;
      elements.outputHeight.value = video.videoHeight;
      elements.outputQuality.value = "86";
      elements.privateFilename.checked = true;
      elements.fileInput.value = "";

      updateMetadataReport();
      updateBitrateOutput();
      updateRedactionButtons();
      updatePresetButtons("original");
      updateRange(elements.outputQuality, elements.qualityControl);
      switchPanel("privacy");

      elements.dropzone.hidden = true;
      elements.editor.hidden = false;
      elements.timeDisplay.textContent = "0:00";
      elements.durationDisplay.textContent = formatTime(state.duration);
      elements.scrubber.value = "0";
      updatePlayButton();
      renderPreview();
      setExportStatus("Ready to protect", `${formatNumber(video.videoWidth)} × ${formatNumber(video.videoHeight)} • ${formatTime(state.duration)}`);

      requestAnimationFrame(() => {
        elements.studio.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error) {
      console.error(error);
      setExportStatus("Could not open the video", "Try another supported file");
      showToast("Could not read this video.", true);
    }
  }

  function createVideoFromFile(file) {
    return new Promise((resolve, reject) => {
      const video = elements.sourceVideo;
      const url = URL.createObjectURL(file);
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        video.dataset.objectUrl = url;
        resolve(video);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not decode the video"));
      };
      video.src = url;
    });
  }

  function closeVideo() {
    releaseSourceUrl();
    if (state.video) {
      state.video.pause();
      state.video.removeAttribute("src");
      state.video.load();
    }
    state.file = null;
    state.video = null;
    state.redactions = [];
    state.selection = null;
    state.playing = false;
    cancelAnimationFrame(state.previewRaf);
    elements.editor.hidden = true;
    elements.dropzone.hidden = false;
    elements.fileInput.value = "";
    elements.timeDisplay.textContent = "0:00";
    elements.durationDisplay.textContent = "0:00";
    elements.scrubber.value = "0";
    updatePlayButton();
    canvasContext.clearRect(0, 0, elements.previewCanvas.width, elements.previewCanvas.height);
    setExportStatus("Ready to protect", "File size will appear after export");
  }

  function releaseSourceUrl() {
    if (state.sourceUrl) {
      URL.revokeObjectURL(state.sourceUrl);
      state.sourceUrl = null;
    }
  }

  function initToolPanels() {
    $$(".tool-tab").forEach((button) => {
      button.addEventListener("click", () => switchPanel(button.dataset.panel));
    });
    $$("[data-go-panel]").forEach((button) => {
      button.addEventListener("click", () => switchPanel(button.dataset.goPanel));
    });
  }

  function switchPanel(panelName) {
    state.activePanel = panelName;
    const panelOrder = ["privacy", "redact", "adjust"];
    const activeIndex = panelOrder.indexOf(panelName);

    const workflowBar = document.querySelector(".workflow-bar");
    if (workflowBar) workflowBar.dataset.step = String(activeIndex + 1);

    $$(".tool-tab").forEach((button) => {
      const active = button.dataset.panel === panelName;
      button.classList.toggle("active", active);
      button.classList.toggle("completed", panelOrder.indexOf(button.dataset.panel) < activeIndex);
      button.setAttribute("aria-pressed", String(active));
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    $$("[data-tool-panel]").forEach((panel) => {
      const active = panel.dataset.toolPanel === panelName;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });

    const redacting = panelName === "redact";
    elements.canvasStage.classList.toggle("redacting", redacting);
    elements.canvasHelp.textContent = redacting
      ? "Drag over the video to hide a sensitive area."
      : "The preview represents the new copy with metadata removed.";

    const redactToolbar = document.getElementById("canvasRedactToolbar");
    if (redactToolbar) redactToolbar.hidden = !redacting;

    renderPreview();
  }

  function initRedactionControls() {
    $$("[data-redaction]").forEach((button) => {
      button.addEventListener("click", () => {
        state.redactionMode = button.dataset.redaction;
        $$("[data-redaction]").forEach((choice) => {
          const active = choice === button;
          choice.classList.toggle("active", active);
          choice.setAttribute("aria-pressed", String(active));
        });
        $$("[data-canvas-redaction]").forEach((choice) => {
          choice.classList.toggle("active", choice.dataset.canvasRedaction === button.dataset.redaction);
        });
      });
    });

    elements.redactionStrength.addEventListener("input", () => {
      elements.strengthOutput.textContent = elements.redactionStrength.value;
      updateRange(elements.redactionStrength, elements.strengthControl);
    });

    elements.undoRedaction.addEventListener("click", () => {
      state.redactions.pop();
      updateRedactionButtons();
      drawFrame(state.comparing);
      showToast("Last hidden area removed.");
    });

    elements.clearRedactions.addEventListener("click", () => {
      state.redactions = [];
      updateRedactionButtons();
      drawFrame(state.comparing);
      showToast("All hidden areas removed.");
    });
  }

  function initCanvasInteractions() {
    const canvas = elements.previewCanvas;

    canvas.addEventListener("pointerdown", (event) => {
      if (!state.video || state.activePanel !== "redact" || state.comparing) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const point = getCanvasPoint(event);
      state.drawing = true;
      state.selection = { startX: point.x, startY: point.y, endX: point.x, endY: point.y };
      drawFrame(state.comparing);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!state.drawing || !state.selection) return;
      event.preventDefault();
      const point = getCanvasPoint(event);
      state.selection.endX = point.x;
      state.selection.endY = point.y;
      drawFrame(state.comparing);
    });

    const finishDrawing = (event) => {
      if (!state.drawing || !state.selection) return;
      if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

      const rectangle = normalizeSelection(state.selection);
      state.drawing = false;
      state.selection = null;

      if (rectangle.width > 0.008 && rectangle.height > 0.008) {
        state.redactions.push({
          ...rectangle,
          mode: state.redactionMode,
          strength: Number(elements.redactionStrength.value)
        });
        updateRedactionButtons();
        showToast("Hidden area added.");
      }
      drawFrame(state.comparing);
    };

    canvas.addEventListener("pointerup", finishDrawing);
    canvas.addEventListener("pointercancel", finishDrawing);

    const startCompare = (event) => {
      if (!state.video) return;
      event.preventDefault();
      state.comparing = true;
      elements.compareButton.classList.add("comparing");
      elements.canvasLabel.textContent = "ORIGINAL PREVIEW";
      drawFrame(true);
    };

    const endCompare = () => {
      if (!state.comparing) return;
      state.comparing = false;
      elements.compareButton.classList.remove("comparing");
      elements.canvasLabel.textContent = "PROTECTED PREVIEW";
      drawFrame(false);
    };

    elements.compareButton.addEventListener("pointerdown", startCompare);
    window.addEventListener("pointerup", endCompare);
    elements.compareButton.addEventListener("keydown", (event) => {
      if ((event.key === " " || event.key === "Enter") && !event.repeat) startCompare(event);
    });
    elements.compareButton.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") endCompare();
    });

    window.addEventListener("resize", () => {
      if (!state.video) return;
      cancelAnimationFrame(state.resizeFrame);
      state.resizeFrame = requestAnimationFrame(() => renderPreview(state.comparing));
    });
  }

  function getCanvasPoint(event) {
    const rect = elements.previewCanvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function normalizeSelection(selection) {
    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    return {
      x,
      y,
      width: Math.abs(selection.endX - selection.startX),
      height: Math.abs(selection.endY - selection.startY)
    };
  }

  function updateRedactionButtons() {
    const hasRedactions = state.redactions.length > 0;
    elements.undoRedaction.disabled = !hasRedactions;
    elements.clearRedactions.disabled = !hasRedactions;
    const canvasUndoBtn = document.getElementById("canvasUndoBtn");
    if (canvasUndoBtn) canvasUndoBtn.disabled = !hasRedactions;
    if (state.video) {
      const suffix = hasRedactions
        ? `${state.redactions.length} ${state.redactions.length === 1 ? "hidden area" : "hidden areas"}`
        : "No visual areas hidden";
      setExportStatus("Ready to protect", suffix);
    }
  }

  function initPlayerControls() {
    elements.playPauseButton.addEventListener("click", togglePlayback);

    elements.scrubber.addEventListener("input", () => {
      if (!state.video || !state.duration) return;
      state.video.currentTime = (Number(elements.scrubber.value) / 1000) * state.duration;
      elements.timeDisplay.textContent = formatTime(state.video.currentTime);
      drawFrame(state.comparing);
    });

    const video = elements.sourceVideo;
    video.addEventListener("play", () => {
      state.playing = true;
      updatePlayButton();
      schedulePreviewFrames();
    });
    video.addEventListener("pause", () => {
      state.playing = false;
      updatePlayButton();
      drawFrame(state.comparing);
    });
    video.addEventListener("ended", () => {
      state.playing = false;
      updatePlayButton();
    });
    video.addEventListener("timeupdate", () => {
      if (!state.duration) return;
      elements.scrubber.value = String(Math.round((video.currentTime / state.duration) * 1000));
      elements.timeDisplay.textContent = formatTime(video.currentTime);
    });
    video.addEventListener("seeked", () => drawFrame(state.comparing));
  }

  function togglePlayback() {
    const video = elements.sourceVideo;
    if (!state.video || !video.videoWidth) return;
    if (video.paused) {
      video.play().catch(() => showToast("Playback was blocked by the browser.", true));
    } else {
      video.pause();
    }
  }

  function updatePlayButton() {
    const playing = state.playing;
    elements.playPauseButton.setAttribute("aria-label", playing ? "Pause preview" : "Play preview");
    elements.playPauseButton.classList.toggle("playing", playing);
    elements.playPauseButton.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14h3V5zM14 5v14h3V5z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l11-7z"/></svg>';
  }

  function schedulePreviewFrames() {
    const video = elements.sourceVideo;
    if (!video) return;
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(onPreviewVideoFrame);
    } else {
      cancelAnimationFrame(state.previewRaf);
      const loop = () => {
        drawFrame(state.comparing);
        if (state.playing) state.previewRaf = requestAnimationFrame(loop);
      };
      state.previewRaf = requestAnimationFrame(loop);
    }
  }

  function onPreviewVideoFrame() {
    drawFrame(state.comparing);
    if (state.playing) schedulePreviewFrames();
  }

  function initAdjustmentControls() {
    elements.outputWidth.addEventListener("input", () => updateDimensions("width"));
    elements.outputHeight.addEventListener("input", () => updateDimensions("height"));

    elements.outputQuality.addEventListener("input", () => {
      updateRange(elements.outputQuality, elements.qualityControl);
      updateBitrateOutput();
      setExportStatus("Ready to protect", `Output bitrate: ${elements.bitrateOutput.textContent}`);
    });

    $("#resetAdjustments").addEventListener("click", () => {
      if (!state.video) return;
      elements.outputWidth.value = state.originalWidth;
      elements.outputHeight.value = state.originalHeight;
      elements.outputQuality.value = "86";
      elements.includeAudio.checked = true;
      updateRange(elements.outputQuality, elements.qualityControl);
      updateBitrateOutput();
      renderPreview();
      updatePresetButtons("original");
      showToast("Original settings restored.");
    });

    $$("[data-size-preset]").forEach((button) => {
      button.addEventListener("click", () => applySizePreset(button.dataset.sizePreset));
    });
  }

  function updateDimensions(changed) {
    if (!state.video) return;
    let width = parseInteger(elements.outputWidth.value);
    let height = parseInteger(elements.outputHeight.value);

    if (elements.lockRatio.checked) {
      if (changed === "width" && width) {
        height = Math.max(1, Math.round(width / state.aspectRatio));
        elements.outputHeight.value = height;
      } else if (changed === "height" && height) {
        width = Math.max(1, Math.round(height * state.aspectRatio));
        elements.outputWidth.value = width;
      }
    }

    if (width && height) {
      updatePresetButtons();
      updateBitrateOutput();
      setExportStatus("Ready to protect", `${formatNumber(width)} × ${formatNumber(height)} pixels`);
      renderPreview();
    }
  }

  function applySizePreset(preset) {
    if (!state.video) return;
    const width = preset === "original"
      ? state.originalWidth
      : Math.min(state.originalWidth, Number(preset));
    elements.outputWidth.value = width;
    elements.outputHeight.value = Math.max(1, Math.round(width / state.aspectRatio));
    updatePresetButtons(preset);
    updateBitrateOutput();
    setExportStatus("Ready to protect", `${formatNumber(width)} × ${formatNumber(elements.outputHeight.value)} pixels`);
    renderPreview();
  }

  function updatePresetButtons(activePreset = null) {
    $$("[data-size-preset]").forEach((button) => {
      const target = button.dataset.sizePreset === "original"
        ? state.originalWidth
        : Math.min(state.originalWidth, Number(button.dataset.sizePreset));
      button.classList.toggle("active", activePreset === button.dataset.sizePreset || Number(elements.outputWidth.value) === target);
    });
  }

  function initOutputFormats() {
    const select = elements.outputFormat;
    if (typeof MediaRecorder === "undefined" || !select) return;
    select.innerHTML = "";
    const supported = OUTPUT_FORMATS.filter(
      (format) => MediaRecorder.isTypeSupported(format.mime) || format.fallback.some((mime) => MediaRecorder.isTypeSupported(mime))
    );
    if (!supported.length) supported.push(OUTPUT_FORMATS[1]);
    supported.forEach((format) => {
      const option = document.createElement("option");
      option.value = format.mime;
      option.textContent = format.label;
      select.appendChild(option);
    });
  }

  function resolveMime(mime) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
    const format = OUTPUT_FORMATS.find((item) => item.mime === mime);
    if (format) {
      const fallback = format.fallback.find((item) => MediaRecorder.isTypeSupported(item));
      if (fallback) return fallback;
    }
    return "video/webm";
  }

  function containerType(mime) {
    return mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  }

  function updateRange(input, wrapper) {
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = ((Number(input.value) - min) / (max - min)) * 100;
    wrapper.style.setProperty("--range-progress", `${progress}%`);
  }

  function updateBitrateOutput() {
    const width = parseInteger(elements.outputWidth.value) || state.originalWidth || 1280;
    const height = parseInteger(elements.outputHeight.value) || state.originalHeight || 720;
    const mbps = computeBitrateMbps(width, height, Number(elements.outputQuality.value));
    elements.bitrateOutput.textContent = `${mbps.toFixed(1)} Mbps`;
  }

  function computeBitrateMbps(width, height, quality) {
    const pixels = width * height;
    const base = clamp(pixels / 921600, 0.35, 3);
    const maxMbps = 3.5 * base;
    return Math.max(0.5, maxMbps * (quality / 100));
  }

  function renderPreview(showOriginal = false) {
    const video = elements.sourceVideo;
    if (!state.video || !video.videoWidth) return;
    const output = getOutputDimensions(false);
    if (!output) return;

    const stageWidth = Math.max(220, elements.canvasStage.clientWidth - 56);
    const maximumWidth = Math.min(1000, stageWidth);
    const maximumHeight = window.innerWidth <= 660 ? 370 : 490;
    const fit = Math.min(maximumWidth / output.width, maximumHeight / output.height, 1);
    const cssWidth = Math.max(1, Math.round(output.width * fit));
    const cssHeight = Math.max(1, Math.round(output.height * fit));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    elements.previewCanvas.width = Math.max(1, Math.round(cssWidth * ratio));
    elements.previewCanvas.height = Math.max(1, Math.round(cssHeight * ratio));
    elements.previewCanvas.style.width = `${cssWidth}px`;
    elements.previewCanvas.style.height = `${cssHeight}px`;

    drawResult(canvasContext, elements.previewCanvas.width, elements.previewCanvas.height, showOriginal);
    if (!showOriginal && state.selection) {
      drawSelection(canvasContext, elements.previewCanvas.width, elements.previewCanvas.height, normalizeSelection(state.selection));
    }
  }

  function drawFrame(showOriginal = false) {
    const canvas = elements.previewCanvas;
    if (!canvas.width || !canvas.height) return;
    drawResult(canvasContext, canvas.width, canvas.height, showOriginal);
    if (!showOriginal && state.selection) {
      drawSelection(canvasContext, canvas.width, canvas.height, normalizeSelection(state.selection));
    }
  }

  function drawResult(context, width, height, showOriginal = false) {
    const video = elements.sourceVideo;
    context.save();
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(video, 0, 0, width, height);
    context.restore();

    if (!showOriginal) applyRedactions(context, width, height);
  }

  function applyRedactions(context, width, height) {
    state.redactions.forEach((redaction) => {
      const x = Math.round(redaction.x * width);
      const y = Math.round(redaction.y * height);
      const areaWidth = Math.max(1, Math.round(redaction.width * width));
      const areaHeight = Math.max(1, Math.round(redaction.height * height));

      if (redaction.mode === "bar") {
        context.save();
        context.fillStyle = "#050505";
        context.fillRect(x, y, areaWidth, areaHeight);
        context.restore();
      } else if (redaction.mode === "blur") {
        applyBlur(context, x, y, areaWidth, areaHeight, redaction.strength);
      } else {
        applyPixelation(context, x, y, areaWidth, areaHeight, redaction.strength);
      }
    });
  }

  function applyPixelation(context, x, y, width, height, strength) {
    const block = Math.max(4, Math.round(Math.min(context.canvas.width, context.canvas.height) * (strength / 1700)));
    const miniWidth = Math.max(1, Math.ceil(width / block));
    const miniHeight = Math.max(1, Math.ceil(height / block));
    const temporary = document.createElement("canvas");
    temporary.width = miniWidth;
    temporary.height = miniHeight;
    const temporaryContext = temporary.getContext("2d");
    temporaryContext.imageSmoothingEnabled = false;
    temporaryContext.drawImage(context.canvas, x, y, width, height, 0, 0, miniWidth, miniHeight);

    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(temporary, 0, 0, miniWidth, miniHeight, x, y, width, height);
    context.restore();
  }

  function applyBlur(context, x, y, width, height, strength) {
    const radius = clamp(Math.round(Math.min(width, height) * (strength / 650)), 3, 60);
    const padding = radius * 2;
    const sourceX = Math.max(0, x - padding);
    const sourceY = Math.max(0, y - padding);
    const sourceRight = Math.min(context.canvas.width, x + width + padding);
    const sourceBottom = Math.min(context.canvas.height, y + height + padding);
    const sourceWidth = sourceRight - sourceX;
    const sourceHeight = sourceBottom - sourceY;
    const temporary = document.createElement("canvas");
    temporary.width = Math.max(1, sourceWidth);
    temporary.height = Math.max(1, sourceHeight);
    temporary.getContext("2d").drawImage(context.canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.filter = `blur(${radius}px)`;
    context.drawImage(temporary, sourceX, sourceY);
    context.restore();
  }

  function drawSelection(context, width, height, selection) {
    context.save();
    context.strokeStyle = "#ffd60a";
    context.lineWidth = Math.max(2, width / 420);
    context.setLineDash([8, 5]);
    context.fillStyle = "rgba(255, 214, 10, 0.12)";
    context.fillRect(selection.x * width, selection.y * height, selection.width * width, selection.height * height);
    context.strokeRect(selection.x * width, selection.y * height, selection.width * width, selection.height * height);
    context.restore();
  }

  function initExportControls() {
    elements.downloadButton.addEventListener("click", exportVideo);
    $$("[data-export-video]").forEach((button) => button.addEventListener("click", exportVideo));
  }

  function initCanvasRedactToolbar() {
    $$("[data-canvas-redaction]").forEach((button) => {
      button.addEventListener("click", () => {
        state.redactionMode = button.dataset.canvasRedaction;
        $$("[data-canvas-redaction]").forEach((choice) => {
          choice.classList.toggle("active", choice === button);
        });
        $$("[data-redaction]").forEach((choice) => {
          const active = choice.dataset.redaction === button.dataset.canvasRedaction;
          choice.classList.toggle("active", active);
          choice.setAttribute("aria-pressed", String(active));
        });
      });
    });

    const canvasUndoBtn = document.getElementById("canvasUndoBtn");
    if (canvasUndoBtn) {
      canvasUndoBtn.addEventListener("click", () => {
        state.redactions.pop();
        updateRedactionButtons();
        drawFrame(state.comparing);
        showToast("Last hidden area removed.");
      });
    }
  }

  async function exportVideo() {
    if (!state.video || state.exportInProgress) return;
    const output = getOutputDimensions(true);
    if (!output) return;

    const requestedMime = elements.outputFormat.value;
    const mimeType = resolveMime(requestedMime);
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(mimeType)) {
      showToast("This browser cannot record in the selected format.", true);
      return;
    }

    state.exportInProgress = true;
    elements.downloadButton.disabled = true;
    elements.downloadButton.textContent = "Creating clean copy...";
    setExportStatus("Protecting video", "Re-encoding frames locally in real time");

    const workCanvas = document.createElement("canvas");
    workCanvas.width = output.width;
    workCanvas.height = output.height;
    const workContext = workCanvas.getContext("2d", { alpha: false });

    const video = elements.sourceVideo;
    const wasMuted = video.muted;
    const includeAudio = elements.includeAudio.checked;
    const bitrate = Math.round(computeBitrateMbps(output.width, output.height, Number(elements.outputQuality.value)) * 1_000_000);

    let stream = null;
    let recorder = null;
    const chunks = [];

    try {
      video.muted = !includeAudio;
      video.volume = includeAudio ? 1 : 0;
      video.currentTime = 0;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await video.play();

      // Give the audio track a moment to appear before capturing it.
      await sleep(250);

      const canvasStream = workCanvas.captureStream(60);
      stream = new MediaStream(canvasStream.getVideoTracks());
      if (includeAudio) {
        const videoStream = video.captureStream();
        videoStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }

      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: 128_000
      });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };

      const finished = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error("The recorder failed while encoding"));
      });

      recorder.start(500);
      video.currentTime = 0;

      const drawExportFrame = () => {
        if (video.ended) return;
        drawResult(workContext, output.width, output.height, false);
        if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(drawExportFrame);
        else state.exportRaf = requestAnimationFrame(drawExportFrame);
      };
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(drawExportFrame);
      else state.exportRaf = requestAnimationFrame(drawExportFrame);

      await new Promise((resolve) => video.addEventListener("ended", resolve, { once: true }));
      await sleep(400);
      if (recorder.state !== "inactive") recorder.stop();
      await finished;

      const container = containerType(mimeType);
      const blob = new Blob(chunks, { type: container });
      if (!blob.size) throw new Error("The browser could not create the file");

      const sanitized = await sanitizeEncodedBlob(blob, container);
      const verification = scanMetadata(await sanitized.arrayBuffer(), container);
      if (verification.count > 0) {
        throw new Error("Local verification found metadata in the output");
      }

      const filename = createOutputFilename(container);
      const url = URL.createObjectURL(sanitized);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);

      const comparison = sanitized.size < state.file.size
        ? `${Math.round((1 - sanitized.size / state.file.size) * 100)}% smaller than the original`
        : "new copy re-encoded without metadata";
      setExportStatus("Protected copy downloaded", `${formatBytes(sanitized.size)} • ${comparison}`);
      showToast("Video protected and verified. Download started.");
    } catch (error) {
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch (ignore) { /* already stopped */ }
      }
      console.error(error);
      setExportStatus("Export failed", "Reduce the dimensions and try again");
      showToast(error.message || "Could not export the video.", true);
    } finally {
      video.pause();
      video.muted = wasMuted;
      video.volume = 1;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      cancelAnimationFrame(state.exportRaf);
      state.exportRaf = null;
      state.exportInProgress = false;
      elements.downloadButton.disabled = false;
      elements.downloadButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4"></path><path d="M5 19h14"></path></svg> Download protected video';
    }
  }

  function createOutputFilename(container) {
    const extension = container === "video/mp4" ? "mp4" : "webm";
    if (elements.privateFilename.checked) {
      return `svideo-protected-${randomToken()}.${extension}`;
    }
    const base = state.file.name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "video";
    return `${base}-protected.${extension}`;
  }

  function randomToken() {
    if (window.crypto && crypto.getRandomValues) {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return Math.random().toString(36).slice(2, 10);
  }

  function getOutputDimensions(showErrors) {
    const width = parseInteger(elements.outputWidth.value);
    const height = parseInteger(elements.outputHeight.value);

    if (!width || !height || width < 1 || height < 1) {
      if (showErrors) showToast("Enter valid video dimensions.", true);
      return null;
    }
    if (width > 16384 || height > 16384) {
      if (showErrors) showToast("The limit is 16,384 pixels per dimension.", true);
      return null;
    }
    if (width * height > 64_000_000) {
      if (showErrors) showToast("The output can contain at most 64 megapixels.", true);
      return null;
    }
    return { width, height };
  }

  function updateMetadataReport() {
    const { count, bytes, labels } = state.metadata;
    if (count > 0) {
      elements.metadataSummary.textContent = `${count} ${count === 1 ? "trace found" : "traces found"}`;
      elements.metadataBlocks.textContent = labels.length ? labels.join(" • ") : `${count} known blocks`;
      elements.metadataMeter.style.width = `${Math.min(100, 24 + count * 16)}%`;
    } else {
      elements.metadataSummary.textContent = "No known traces";
      elements.metadataBlocks.textContent = "Cleaning will still be applied";
      elements.metadataMeter.style.width = "16%";
    }
    elements.metadataSize.textContent = formatBytes(bytes);
  }

  /* ------------------------------ metadata scan ------------------------------ */

  function scanMetadata(buffer, mimeType) {
    const bytes = new Uint8Array(buffer);
    if (isIsoBmff(bytes)) return scanIsoBmff(bytes);
    if (isWebM(bytes)) return scanWebM(bytes);
    return { count: 0, bytes: 0, labels: [] };
  }

  /* ------------------------------ ISO BMFF (MP4 / MOV) ------------------------------ */

  const ISO_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "mvex", "moof", "traf"]);

  function isIsoBmff(data) {
    return data.length > 12 && ascii(data, 4, 4) === "ftyp";
  }

  function parseBoxes(data, start, end) {
    const boxes = [];
    let offset = start;
    while (offset + 8 <= end) {
      const size = readUint32BE(data, offset);
      if (size === 0) break;
      const type = ascii(data, offset + 4, 4);
      let headerSize = 8;
      let total = size;
      if (size === 1) {
        if (offset + 16 > end) break;
        total = readUint64BE(data, offset + 8);
        if (total < 16) break;
        headerSize = 16;
      } else if (size < 8) {
        break;
      }
      if (offset + total > end) break;
      boxes.push({ start: offset, size: total, headerSize, type, payloadStart: offset + headerSize, end: offset + total });
      offset += total;
    }
    return boxes;
  }

  function scanIsoBmff(data) {
    let count = 0;
    let totalBytes = 0;
    const labels = new Set();

    const visit = (boxes) => {
      for (const box of boxes) {
        if (box.type === "udta") {
          count += 1;
          totalBytes += box.size;
          const sample = ascii(data, box.payloadStart, Math.min(box.size - box.headerSize, 220)).toLowerCase();
          if (sample.includes("\u00a9xyz") || sample.includes("iso6709") || sample.includes("location") || sample.includes("gps")) labels.add("GPS location");
          else if (sample.includes("\u00a9")) labels.add("User data");
          else labels.add("User data (udta)");
        } else if (box.type === "meta") {
          count += 1;
          totalBytes += box.size;
          const sample = ascii(data, box.payloadStart + 4, Math.min(box.size - box.headerSize - 4, 220)).toLowerCase();
          if (sample.includes("xmp")) labels.add("XMP");
          else if (sample.includes("exif")) labels.add("EXIF/GPS");
          else labels.add("Metadata (meta)");
        } else if (ISO_CONTAINERS.has(box.type)) {
          visit(parseBoxes(data, box.payloadStart, box.end));
        }
      }
    };

    visit(parseBoxes(data, 0, data.length));
    return { count, bytes: totalBytes, labels: [...labels] };
  }

  function stripIsoBmffMetadata(data) {
    if (!isIsoBmff(data)) return data;

    const ranges = [];
    const sizePatches = new Map();
    const chunkBoxes = [];

    const collect = (boxes, ancestors) => {
      for (const box of boxes) {
        if (box.type === "udta" || box.type === "meta") {
          ranges.push({ start: box.start, end: box.end });
          for (const ancestor of ancestors) {
            const previous = sizePatches.get(ancestor.start);
            sizePatches.set(ancestor.start, {
              delta: (previous ? previous.delta : 0) + box.size,
              headerSize: ancestor.headerSize
            });
          }
        } else if (ISO_CONTAINERS.has(box.type)) {
          const children = parseBoxes(data, box.payloadStart, box.end);
          if (box.type === "stbl") {
            children.forEach((child) => {
              if (child.type === "stco" || child.type === "co64") chunkBoxes.push(child);
            });
          }
          collect(children, [...ancestors, box]);
        } else if (box.type === "stco" || box.type === "co64") {
          chunkBoxes.push(box);
        }
      }
    };

    const top = parseBoxes(data, 0, data.length);
    collect(top, []);

    if (!ranges.length) return data;

    ranges.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range.start < last.end) {
        if (range.end > last.end) last.end = range.end;
      } else {
        merged.push({ start: range.start, end: range.end });
      }
    }

    const removedBefore = (position) => {
      let total = 0;
      for (const range of merged) {
        if (range.start >= position) break;
        total += Math.min(range.end, position) - range.start;
      }
      return total;
    };

    const removedTotal = merged.reduce((sum, range) => sum + (range.end - range.start), 0);
    const output = new Uint8Array(data.length - removedTotal);
    let outPosition = 0;
    let inPosition = 0;
    for (const range of merged) {
      output.set(data.subarray(inPosition, range.start), outPosition);
      outPosition += range.start - inPosition;
      inPosition = range.end;
    }
    output.set(data.subarray(inPosition), outPosition);

    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

    for (const [boxStart, patch] of sizePatches) {
      const insideRange = merged.some((range) => boxStart >= range.start && boxStart < range.end);
      if (insideRange) continue;
      const newStart = boxStart - removedBefore(boxStart);
      if (patch.headerSize === 16) {
        if (newStart + 16 > output.length) continue;
        const adjusted = readUint64BE(output, newStart + 8) - patch.delta;
        if (adjusted >= 16) writeUint64BE(output, newStart + 8, adjusted);
      } else {
        if (newStart + 4 > output.length) continue;
        const adjusted = view.getUint32(newStart, false) - patch.delta;
        if (adjusted >= 8) view.setUint32(newStart, adjusted, false);
      }
    }

    for (const box of chunkBoxes) {
      const newBoxStart = box.start - removedBefore(box.start);
      const is64 = box.type === "co64";
      const entrySize = is64 ? 8 : 4;
      const count = readUint32BE(output, newBoxStart + 12);
      for (let index = 0; index < count; index += 1) {
        const entryOffset = newBoxStart + 16 + index * entrySize;
        if (entryOffset + entrySize > output.length) break;
        const originalOffset = is64
          ? readUint64BE(data, box.start + 16 + index * entrySize)
          : readUint32BE(data, box.start + 16 + index * entrySize);
        const newOffset = originalOffset - removedBefore(originalOffset);
        if (newOffset >= 0) {
          if (is64) writeUint64BE(output, entryOffset, newOffset);
          else view.setUint32(entryOffset, newOffset, false);
        }
      }
    }

    return output;
  }

  /* ------------------------------ WebM / EBML ------------------------------ */

  const EBML_SEGMENT = 0x18538067;
  const EBML_SEEK_HEAD = 0x114d9b74;
  const EBML_INFO = 0x1549a966;
  const EBML_TAGS = 0x1254c367;
  const EBML_CUES = 0x1c53bb6b;
  const EBML_INFO_FIELDS = new Set([0x7ba9, 0x4d80, 0x5741, 0x4461]); // Title, MuxingApp, WritingApp, DateUTC

  function isWebM(data) {
    return data.length > 4 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
  }

  function readEbmlId(data, offset) {
    if (offset >= data.length) return { id: -1, length: 0 };
    const first = data[offset];
    if (first === 0x00) return { id: -1, length: 0 };
    let length = 1;
    let probe = 0x80;
    while (length < 4 && !(first & probe)) {
      probe >>= 1;
      length += 1;
    }
    if (offset + length > data.length) return { id: -1, length: 0 };
    let id = 0;
    for (let index = 0; index < length; index += 1) id = id * 256 + data[offset + index];
    return { id, length };
  }

  function ebmlSizeLength(first) {
    if (first === 0x00) return 0;
    if (first === 0xff) return 1;
    let length = 1;
    let probe = 0x80;
    while (length < 8 && !(first & probe)) {
      probe >>= 1;
      length += 1;
    }
    return length;
  }

  function readEbmlSize(data, offset) {
    if (offset >= data.length) return null;
    const first = data[offset];
    if (first === 0x00) return null;
    if (first === 0xff) return { size: -1, length: 1 };
    const length = ebmlSizeLength(first);
    if (offset + length > data.length) return null;
    if (length === 8 && first === 0x01) {
      let allOnes = true;
      for (let index = 1; index < 8; index += 1) {
        if (data[offset + index] !== 0xff) { allOnes = false; break; }
      }
      if (allOnes) return { size: -1, length };
    }
    let size = first & (0xff >> length);
    for (let index = 1; index < length; index += 1) size = size * 256 + data[offset + index];
    return { size, length };
  }

  function encodeEbmlSize(size) {
    if (!(size >= 0)) return [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
    if (size === 0) return [0x80];
    let length = 1;
    if (size <= 0x7e) length = 1;
    else if (size <= 0x3fff) length = 2;
    else if (size <= 0x1fffff) length = 3;
    else if (size <= 0x0fffffff) length = 4;
    else if (size <= 0x7ffffffff) length = 5;
    else if (size <= 0x3ffffffffff) length = 6;
    else if (size <= 0x1ffffffffffff) length = 7;
    else length = 8;
    const bytes = new Array(length);
    let value = size;
    for (let index = length - 1; index >= 1; index -= 1) {
      bytes[index] = value & 0xff;
      value = Math.floor(value / 256);
    }
    bytes[0] = (0x80 >> (length - 1)) | value;
    return bytes;
  }

  function encodeEbmlId(id) {
    const bytes = [];
    let value = id;
    while (value > 0) {
      bytes.unshift(value & 0xff);
      value = Math.floor(value / 256);
    }
    return Uint8Array.from(bytes);
  }

  function encodeElement(id, payload) {
    const idBytes = encodeEbmlId(id);
    const sizeBytes = encodeEbmlSize(payload.length);
    const output = new Uint8Array(idBytes.length + sizeBytes.length + payload.length);
    output.set(idBytes, 0);
    output.set(sizeBytes, idBytes.length);
    output.set(payload, idBytes.length + sizeBytes.length);
    return output;
  }

  function scanWebM(data) {
    let count = 0;
    let totalBytes = 0;
    const labels = new Set();

    const ebmlId = readEbmlId(data, 0);
    if (ebmlId.id !== 0x1a45dfa3) return { count: 0, bytes: 0, labels: [] };
    const ebmlSize = readEbmlSize(data, ebmlId.length);
    if (!ebmlSize) return { count: 0, bytes: 0, labels: [] };
    const ebmlEnd = ebmlId.length + ebmlSize.length + (ebmlSize.size === -1 ? data.length : ebmlSize.size);

    const segmentId = readEbmlId(data, ebmlEnd);
    if (segmentId.id !== EBML_SEGMENT) return { count: 0, bytes: 0, labels: [] };
    const segmentSize = readEbmlSize(data, ebmlEnd + segmentId.length);
    if (!segmentSize) return { count: 0, bytes: 0, labels: [] };
    const segmentPayloadStart = ebmlEnd + segmentId.length + segmentSize.length;
    const segmentEnd = segmentSize.size === -1 ? data.length : Math.min(data.length, segmentPayloadStart + segmentSize.size);

    let offset = segmentPayloadStart;
    while (offset + 2 <= segmentEnd) {
      const element = readEbmlId(data, offset);
      if (!element.length) break;
      const size = readEbmlSize(data, offset + element.length);
      if (!size) break;
      const payloadStart = offset + element.length + size.length;
      const elementEnd = size.size === -1 ? segmentEnd : Math.min(segmentEnd, payloadStart + size.size);
      if (elementEnd > data.length) break;

      if (element.id === EBML_TAGS) {
        count += 1;
        totalBytes += elementEnd - offset;
        labels.add("Tags");
      } else if (element.id === EBML_INFO) {
        let inner = payloadStart;
        while (inner + 2 <= elementEnd) {
          const field = readEbmlId(data, inner);
          const fieldSize = readEbmlSize(data, inner + field.length);
          if (!field.length || !fieldSize) break;
          const fieldEnd = fieldSize.size === -1 ? elementEnd : Math.min(elementEnd, inner + field.length + fieldSize.length + fieldSize.size);
          if (EBML_INFO_FIELDS.has(field.id)) {
            count += 1;
            totalBytes += fieldEnd - inner;
            labels.add(field.id === 0x4461 ? "Date/UTC" : field.id === 0x7ba9 ? "Title" : "Writing app");
          }
          inner = fieldEnd;
        }
      }
      offset = elementEnd;
    }

    return { count, bytes: totalBytes, labels: [...labels] };
  }

  function stripWebMMetadata(data) {
    if (!isWebM(data)) return data;

    const ebmlId = readEbmlId(data, 0);
    if (ebmlId.id !== 0x1a45dfa3) return data;
    const ebmlSize = readEbmlSize(data, ebmlId.length);
    if (!ebmlSize) return data;
    const ebmlEnd = ebmlId.length + ebmlSize.length + (ebmlSize.size === -1 ? data.length - ebmlId.length - ebmlSize.length : ebmlSize.size);

    const segmentId = readEbmlId(data, ebmlEnd);
    if (segmentId.id !== EBML_SEGMENT) return data;
    const segmentSize = readEbmlSize(data, ebmlEnd + segmentId.length);
    if (!segmentSize) return data;
    const segmentPayloadStart = ebmlEnd + segmentId.length + segmentSize.length;
    const segmentEnd = segmentSize.size === -1 ? data.length : Math.min(data.length, segmentPayloadStart + segmentSize.size);

    const segments = [];
    let offset = segmentPayloadStart;
    while (offset + 2 <= segmentEnd) {
      const element = readEbmlId(data, offset);
      if (!element.length) break;
      const size = readEbmlSize(data, offset + element.length);
      if (!size) break;
      const payloadStart = offset + element.length + size.length;
      const elementEnd = size.size === -1 ? segmentEnd : Math.min(segmentEnd, payloadStart + size.size);
      if (elementEnd > data.length) break;
      segments.push({ id: element.id, start: offset, payloadStart, end: elementEnd });
      offset = elementEnd;
    }

    const removedRanges = [];
    for (const element of segments) {
      if (element.id === EBML_SEEK_HEAD || element.id === EBML_TAGS) {
        removedRanges.push({ start: element.start - segmentPayloadStart, end: element.end - segmentPayloadStart });
      } else if (element.id === EBML_INFO) {
        let inner = element.payloadStart;
        while (inner + 2 <= element.end) {
          const field = readEbmlId(data, inner);
          const fieldSize = readEbmlSize(data, inner + field.length);
          if (!field.length || !fieldSize) break;
          const fieldEnd = fieldSize.size === -1 ? element.end : Math.min(element.end, inner + field.length + fieldSize.length + fieldSize.size);
          if (EBML_INFO_FIELDS.has(field.id)) {
            removedRanges.push({ start: inner - segmentPayloadStart, end: fieldEnd - segmentPayloadStart });
          }
          inner = fieldEnd;
        }
      }
    }
    removedRanges.sort((a, b) => a.start - b.start);

    if (!removedRanges.length) return data;

    const removedBefore = (relativePosition) => {
      let total = 0;
      for (const range of removedRanges) {
        if (range.start >= relativePosition) break;
        total += Math.min(range.end, relativePosition) - range.start;
      }
      return total;
    };

    const parts = [data.subarray(0, ebmlEnd)];
    const payloadParts = [];
    for (const element of segments) {
      if (element.id === EBML_SEEK_HEAD || element.id === EBML_TAGS) continue;
      if (element.id === EBML_INFO) {
        payloadParts.push(rebuildInfo(data, element));
      } else if (element.id === EBML_CUES) {
        payloadParts.push(rebuildCues(data, element, removedBefore));
      } else {
        payloadParts.push(data.subarray(element.start, element.end));
      }
    }
    const newPayload = concatBytes(payloadParts);
    parts.push(new Uint8Array([0x18, 0x53, 0x80, 0x67]));
    parts.push(Uint8Array.from(encodeEbmlSize(newPayload.length)));
    parts.push(newPayload);
    return concatBytes(parts);
  }

  function rebuildInfo(data, element) {
    const children = [];
    let inner = element.payloadStart;
    while (inner + 2 <= element.end) {
      const field = readEbmlId(data, inner);
      const fieldSize = readEbmlSize(data, inner + field.length);
      if (!field.length || !fieldSize) break;
      const fieldEnd = fieldSize.size === -1 ? element.end : Math.min(element.end, inner + field.length + fieldSize.length + fieldSize.size);
      if (!EBML_INFO_FIELDS.has(field.id)) {
        children.push(data.subarray(inner, fieldEnd));
      }
      inner = fieldEnd;
    }
    return encodeElement(EBML_INFO, concatBytes(children));
  }

  function rebuildCues(data, element, removedBefore) {
    const points = [];
    let offset = element.payloadStart;
    while (offset + 2 <= element.end) {
      const pointId = readEbmlId(data, offset);
      if (pointId.id !== 0xbb) break;
      const pointSize = readEbmlSize(data, offset + pointId.length);
      if (!pointSize) break;
      const pointPayloadStart = offset + pointId.length + pointSize.length;
      const pointEnd = pointSize.size === -1 ? element.end : Math.min(element.end, pointPayloadStart + pointSize.size);

      const children = [];
      let inner = pointPayloadStart;
      while (inner + 2 <= pointEnd) {
        const childId = readEbmlId(data, inner);
        const childSize = readEbmlSize(data, inner + childId.length);
        if (!childId.length || !childSize) break;
        const childPayloadStart = inner + childId.length + childSize.length;
        const childEnd = childSize.size === -1 ? pointEnd : Math.min(pointEnd, childPayloadStart + childSize.size);
        let payload = data.subarray(childPayloadStart, childEnd);
        if (childId.id === 0xb7) {
          payload = rebuildCueTrackPositions(data, inner, childEnd, removedBefore);
        }
        children.push(encodeElement(childId.id, payload));
        inner = childEnd;
      }
      points.push(encodeElement(0xbb, concatBytes(children)));
      offset = pointEnd;
    }
    return encodeElement(EBML_CUES, concatBytes(points));
  }

  function rebuildCueTrackPositions(data, elementStart, elementEnd, removedBefore) {
    const elementId = readEbmlId(data, elementStart);
    const elementSize = readEbmlSize(data, elementStart + elementId.length);
    if (!elementSize) return data.subarray(elementStart, elementEnd);
    const payloadStart = elementStart + elementId.length + elementSize.length;
    const children = [];
    let inner = payloadStart;
    while (inner + 2 <= elementEnd) {
      const childId = readEbmlId(data, inner);
      const childSize = readEbmlSize(data, inner + childId.length);
      if (!childId.length || !childSize) break;
      const childPayloadStart = inner + childId.length + childSize.length;
      const childEnd = childSize.size === -1 ? elementEnd : Math.min(elementEnd, childPayloadStart + childSize.size);
      let payload = data.subarray(childPayloadStart, childEnd);
      if (childId.id === 0xf1 && childSize.size !== -1) {
        // CueClusterPosition is a vint-encoded value in the payload.
        const value = readEbmlSize(data, childPayloadStart);
        if (value && value.size !== -1) {
          const adjusted = Math.max(0, value.size - removedBefore(value.size));
          payload = Uint8Array.from(encodeEbmlSize(adjusted));
        }
      }
      children.push(encodeElement(childId.id, payload));
      inner = childEnd;
    }
    return concatBytes(children);
  }

  /* ------------------------------ shared byte helpers ------------------------------ */

  function concatBytes(parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  function readUint32BE(data, offset) {
    return (((data[offset] << 24) >>> 0) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
  }

  function readUint64BE(data, offset) {
    return readUint32BE(data, offset) * 4294967296 + readUint32BE(data, offset + 4);
  }

  function writeUint64BE(data, offset, value) {
    const high = Math.floor(value / 4294967296);
    const low = value % 4294967296;
    data[offset] = (high >>> 24) & 0xff;
    data[offset + 1] = (high >>> 16) & 0xff;
    data[offset + 2] = (high >>> 8) & 0xff;
    data[offset + 3] = high & 0xff;
    data[offset + 4] = (low >>> 24) & 0xff;
    data[offset + 5] = (low >>> 16) & 0xff;
    data[offset + 6] = (low >>> 8) & 0xff;
    data[offset + 7] = low & 0xff;
  }

  function ascii(data, start, length) {
    let result = "";
    const end = Math.min(data.length, start + length);
    for (let index = start; index < end; index += 1) result += String.fromCharCode(data[index]);
    return result;
  }

  async function sanitizeEncodedBlob(blob, mimeType) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let cleaned = bytes;
    if (mimeType === "video/mp4" || isIsoBmff(bytes)) cleaned = stripIsoBmffMetadata(bytes);
    else if (mimeType === "video/webm" || isWebM(bytes)) cleaned = stripWebMMetadata(bytes);
    return cleaned === bytes ? blob : new Blob([cleaned], { type: mimeType });
  }

  /* ------------------------------ ui helpers ------------------------------ */

  function setExportStatus(title, detail) {
    elements.exportStatus.textContent = title;
    elements.outputEstimate.textContent = detail;
  }

  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.classList.add("show");
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3300);
  }

  function parseInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  function formatNumber(number) {
    return new Intl.NumberFormat("en-US").format(number);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  init();
})();
