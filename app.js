// app.js (v11.0 - Reset Popup)

document.addEventListener("DOMContentLoaded", () => {
  // --- State Toàn Cục ---
  let appState = {
    locations: [],
    longestLabel: "",
    totalLabels: 0,
  };
  let layoutState = {};
  const SETTINGS_KEY = "wmsLabelSettings_v11"; // <-- NÂNG CẤP v11.0
  const MM_TO_PX = 3.7795275591;

  // --- DOM Elements ---
  const dropZone = document.getElementById("drop-zone");
  const statusMessage = document.getElementById("status-message");
  const previewWrapper = document.getElementById("a4-preview-wrapper");
  const previewSelector = document.getElementById("preview-selector");
  const allSettingInputs = document.querySelectorAll(
    ".setting-input, .setting-range"
  );
  const toolsWrapper = document.getElementById("tools-wrapper");
  const introPopup = document.getElementById("intro-popup");
  const popupCloseBtn = document.getElementById("popup-close-btn");

  // --- GIÁ TRỊ MẶC ĐỊNH (v10.0) ---
  const DEFAULT_LAYOUT = {
    "--small-top": "15mm",
    "--small-left": "15mm",
    "--large-top": "70mm",
    "--large-left": "148.5mm",
    "--spaced-top": "145mm",
    "--spaced-left": "148.5mm",
    "--title-top": "165mm",
    "--title-left": "148.5mm",
    "--spaced-size": "20pt",
    "--title-size": "24pt",
    "--small-scale": "1.5",
    "--large-scale": "2.5",
  };

  // ===========================================
  // MODULE: LAYOUT (Quản lý State)
  // ===========================================

  function loadLayout(forceReset = false) {
    let savedSettings = null;
    if (!forceReset) {
      savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    }
    layoutState = { ...DEFAULT_LAYOUT, ...savedSettings };
    updateInputsFromState();
    applyStateToRoot();
  }

  function saveLayout() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(layoutState));
  }

  function updateLayoutState(key, value) {
    if (layoutState.hasOwnProperty(key)) {
      layoutState[key] = value;
      if (key.startsWith("--")) {
        applyStateToRoot();
      }
    }
  }

  function updateInputsFromState() {
    allSettingInputs.forEach((input) => {
      let stateKey;
      if (input.type === "range") {
        stateKey = `--${input.id.replace("setting-", "")}`;
      } else {
        stateKey = input.id.replace("setting-", "").replace("col-", "col");
      }
      if (layoutState[stateKey]) {
        input.value =
          parseFloat(layoutState[stateKey]) || layoutState[stateKey];
        if (input.type === "range") {
          const labelId = `label-${input.id.replace("setting-", "")}`;
          const unit = input.dataset.unit || "";
          document.getElementById(
            labelId
          ).textContent = `${input.value}${unit}`;
        }
      }
    });
  }

  function applyStateToRoot() {
    for (const [key, value] of Object.entries(layoutState)) {
      if (key.startsWith("--")) {
        document.documentElement.style.setProperty(key, value);
      }
    }
  }

  // ===========================================
  // MODULE: BARCODE (Cập nhật v10.0)
  // ===========================================
  function drawBarcode(canvasId, loc, type) {
    const scale = parseFloat(layoutState[`--${type}-scale`]);
    const height = type === "small" ? 10 : 24;
    try {
      bwipjs.toCanvas(canvasId, {
        bcid: "code39ext",
        text: loc,
        scale: scale,
        height: height,
        includetext: false,
      });
    } catch (e) {
      console.error(`Lỗi tạo barcode cho canvas #${canvasId}`, e);
      throw new Error(
        `Không thể tạo barcode cho "${loc}". Dữ liệu có thể không hợp lệ.`
      );
    }
  }

  // ===========================================
  // MODULE: INTERACTIONS (Canva) (Không đổi)
  // ===========================================
  function makeDraggable({
    element,
    previewPane,
    scale,
    stateKeyX,
    stateKeyY,
    onDragEnd,
  }) {
    let isDragging = false;
    let startX_screen, startY_screen;
    let startLeft_mm, startTop_mm;
    element.onmousedown = (e) => {
      e.preventDefault();
      isDragging = true;
      element.classList.add("dragging");
      startX_screen = e.clientX;
      startY_screen = e.clientY;
      startLeft_mm = parseFloat(layoutState[stateKeyX]);
      startTop_mm = parseFloat(layoutState[stateKeyY]);
      document.onmousemove = onMouseMove;
      document.onmouseup = onMouseUp;
    };
    function onMouseMove(e) {
      if (!isDragging) return;
      const deltaX_screen = e.clientX - startX_screen;
      const deltaY_screen = e.clientY - startY_screen;
      const deltaX_scaled_px = deltaX_screen / scale;
      const deltaY_scaled_px = deltaY_screen / scale;
      const deltaX_mm = deltaX_scaled_px / MM_TO_PX;
      const deltaY_mm = deltaY_scaled_px / MM_TO_PX;
      const newLeft_mm = startLeft_mm + deltaX_mm;
      const newTop_mm = startTop_mm + deltaY_mm;
      updateLayoutState(stateKeyX, `${newLeft_mm.toFixed(2)}mm`);
      updateLayoutState(stateKeyY, `${newTop_mm.toFixed(2)}mm`);
    }
    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      element.classList.remove("dragging");
      document.onmousemove = null;
      document.onmouseup = null;
      if (onDragEnd) onDragEnd();
    }
  }

  // ===========================================
  // MODULE: EXCEL PARSER (Cập nhật v10.0 - Tự động)
  // ===========================================
  function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          const dataStartRow = 1;
          const rawData = json.slice(dataStartRow);
          let longestLabel = "";
          let totalLabels = 0;
          const locations = rawData
            .map((row) => {
              const loc = row[1] || row[0];
              let qty = parseInt(row[2], 10);
              if (isNaN(qty) || qty < 1) qty = 1;
              return { loc, qty };
            })
            .filter((item) => item.loc != null)
            .map((item) => ({ loc: String(item.loc).trim(), qty: item.qty }))
            .filter((item) => item.loc.length > 0);
          if (locations.length === 0)
            throw new Error(
              `Không tìm thấy dữ liệu. (Đã kiểm tra Cột A, B, C)`
            );
          locations.forEach((item) => {
            totalLabels += item.qty;
            if (item.loc.length > longestLabel.length) {
              longestLabel = item.loc;
            }
          });
          resolve({ locations, longestLabel, totalLabels });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(new Error("Không thể đọc file."));
      reader.readAsArrayBuffer(file);
    });
  }

  // ===========================================
  // MODULE: PRINT (Cập nhật v10.0 - Đọc scale)
  // ===========================================
  function handlePrint(locations, currentLayoutState) {
    if (!locations || locations.length === 0) return;
    const printList = locations.flatMap((item) =>
      Array(item.qty).fill(item.loc)
    );
    let allPagesHtml = "";
    printList.forEach((loc, index) => {
      allPagesHtml += generatePrintPageHtml(loc, index, currentLayoutState);
    });
    const cssStyles = getPrintStyles();
    const smallScale = parseFloat(currentLayoutState["--small-scale"]);
    const largeScale = parseFloat(currentLayoutState["--large-scale"]);
    const printScript = `
            <script>
                document.addEventListener('DOMContentLoaded', () => {
                    const locations = ${JSON.stringify(printList)};
                    try {
                        locations.forEach((loc, index) => {
                            bwipjs.toCanvas('bc-small-' + index, { bcid: 'code39ext', text: loc, scale: ${smallScale}, height: 10, includetext: false });
                            bwipjs.toCanvas('bc-large-' + index, { bcid: 'code39ext', text: loc, scale: ${largeScale}, height: 24, includetext: false });
                        });
                        setTimeout(() => { window.print(); }, 500);
                    } catch (e) {
                        document.body.innerHTML = '<h1>Lỗi tạo barcode: ' + e.message + '</h1>';
                    }
                });
            </script>
        `;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
            <html><head><title>Đang in ${printList.length} nhãn...</title>
                ${cssStyles}
                <script src="https://cdnjs.cloudflare.com/ajax/libs/bwip-js/4.7.0/bwip-js.js"></script>
            </head><body>
                <div class="print-container">${allPagesHtml}</div>
                ${printScript}
            </body></html>
        `);
    printWindow.document.close();
  }
  function getPrintStyles() {
    return `
        <style>
            @page { size: A4 landscape; margin: 0; }
            body { margin: 0; padding: 0; background: #fff; }
            .a4-page {
                width: 297mm; height: 210mm; position: relative;
                overflow: hidden; box-sizing: border-box;
                font-family: 'Arial', sans-serif; page-break-after: always; 
            }
            .barcode-small, .barcode-large, .text-element {
                position: absolute;
            }
            .barcode-large, .text-element {
                transform: translateX(-50%); text-align: center;
            }
            .text-element { white-space: nowrap; }
            .text-spaced {
                font-family: 'Courier New', monospace;
                font-weight: bold; letter-spacing: 0.5em;
            }
            .text-main-title {
                font-family: 'Arial', sans-serif;
                font-weight: bold;
            }
        </style>
        `;
  }
  function generatePrintPageHtml(loc, index, currentLayoutState) {
    const displayLoc = loc.toUpperCase();
    const largeStyle = `top:${currentLayoutState["--large-top"]}; left:${currentLayoutState["--large-left"]};`;
    const smallStyle = `top:${currentLayoutState["--small-top"]}; left:${currentLayoutState["--small-left"]};`;
    const spacedStyle = `top:${currentLayoutState["--spaced-top"]}; left:${currentLayoutState["--spaced-left"]}; font-size:${currentLayoutState["--spaced-size"]};`;
    const titleStyle = `top:${currentLayoutState["--title-top"]}; left:${currentLayoutState["--title-left"]}; font-size:${currentLayoutState["--title-size"]};`;
    return `
            <div class="a4-page">
                <canvas id="bc-small-${index}" class="barcode-small" style="${smallStyle}"></canvas>
                <canvas id="bc-large-${index}" class="barcode-large" style="${largeStyle}"></canvas>
                <div class="text-element text-spaced" style="${spacedStyle}">${displayLoc}</div>
                <div class="text-element text-main-title" style="${titleStyle}">${displayLoc}</div>
            </div>
        `;
  }

  // ===========================================
  // MODULE: UI & MAIN (Phần kết nối)
  // ===========================================

  async function handleFile(file) {
    try {
      const result = await parseExcelFile(file);
      appState = { ...result };
      enableTools(result.totalLabels);
      updateToolbar(appState.locations, appState.longestLabel);
      updatePreview(appState.longestLabel);
      return {
        success: true,
        message: `✅ Tải thành công ${result.totalLabels} nhãn.`,
      };
    } catch (err) {
      console.error(err);
      toolsWrapper.classList.add("hidden");
      document.getElementById("print-button").disabled = true;
      document.getElementById("preview-toolbar").classList.add("hidden");
      return { success: false, message: `Lỗi: ${err.message}` };
    }
  }

  function initLayoutInputs() {
    allSettingInputs.forEach((input) => {
      input.addEventListener("input", () => {
        const id = input.id;
        const value = input.value;
        let stateKey;
        if (input.type === "range") {
          stateKey = `--${id.replace("setting-", "")}`;
          const unit = input.dataset.unit || "";
          updateLayoutState(stateKey, `${value}${unit}`);
          const labelId = `label-${id.replace("setting-", "")}`;
          document.getElementById(labelId).textContent = `${value}${unit}`;
        }
      });
      input.addEventListener("change", () => {
        // Chỉ lưu khi thả chuột/nhập xong
        saveLayout();
        const currentPreviewLoc =
          previewSelector.options[previewSelector.selectedIndex]?.value;
        if (currentPreviewLoc) {
          updatePreview(currentPreviewLoc);
        }
      });
    });
  }

  // Đã fix (v7.2)
  function initDropZone() {
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleDrop = async (e) => {
      preventDefaults(e);
      dropZone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        statusMessage.textContent = "Đang xử lý...";
        try {
          const result = await handleFile(files[0]);
          statusMessage.textContent = result.message;
          statusMessage.className = result.success ? "success" : "error";
        } catch (err) {
          console.error("Lỗi nghiêm trọng khi thả file:", err);
          statusMessage.textContent = `Lỗi: ${err.message}`;
          statusMessage.className = "error";
        }
      }
    };
    dropZone.addEventListener("dragenter", preventDefaults, false);
    dropZone.addEventListener(
      "dragleave",
      (e) => {
        preventDefaults(e);
        dropZone.classList.remove("dragover");
      },
      false
    );
    dropZone.addEventListener(
      "dragover",
      (e) => {
        preventDefaults(e);
        dropZone.classList.add("dragover");
      },
      false
    );
    dropZone.addEventListener("drop", handleDrop, false);
  }

  function updateToolbar(locations, longestLabel) {
    previewSelector.innerHTML = "";
    previewSelector.add(
      new Option(`Mã dài nhất: ${longestLabel}`, longestLabel)
    );
    locations.forEach((item) => {
      if (item.loc !== longestLabel) {
        previewSelector.add(new Option(item.loc, item.loc));
      }
    });
    previewSelector.onchange = (e) => {
      updatePreview(e.target.value);
    };
    document.getElementById("preview-toolbar").classList.remove("hidden");
  }

  function enableTools(totalLabels) {
    toolsWrapper.classList.remove("hidden");
    const printButton = document.getElementById("print-button");
    printButton.disabled = false;
    printButton.querySelector("span").textContent = `(${totalLabels})`;
  }

  function updatePreview(loc) {
    if (!loc) {
      previewWrapper.innerHTML =
        '<p style="text-align:center; padding: 50px;">Tải file để xem trước</p>';
      return;
    }
    const displayLoc = loc.toUpperCase();
    previewWrapper.innerHTML = `
            <div class="a4-page">
                <canvas id="prev-bc-small" class="draggable barcode-small"></canvas>
                <canvas id="prev-bc-large" class="draggable barcode-large"></canvas>
                <div id="prev-text-spaced" class="draggable text-element text-spaced">${displayLoc}</div>
                <div id="prev-text-title" class="draggable text-element text-main-title">${displayLoc}</div>
            </div>
        `;
    try {
      drawBarcode("prev-bc-small", loc, "small");
      drawBarcode("prev-bc-large", loc, "large");
    } catch (e) {
      statusMessage.textContent = `Lỗi: ${e.message}`;
      statusMessage.className = "error";
    }
    const previewPane = document.getElementById("a4-preview-wrapper");
    const scale = 0.85;
    makeDraggable({
      element: document.getElementById("prev-bc-small"),
      previewPane,
      scale,
      stateKeyX: "--small-left",
      stateKeyY: "--small-top",
      onDragEnd: saveLayout,
    });
    makeDraggable({
      element: document.getElementById("prev-bc-large"),
      previewPane,
      scale,
      stateKeyX: "--large-left",
      stateKeyY: "--large-top",
      onDragEnd: saveLayout,
    });
    makeDraggable({
      element: document.getElementById("prev-text-spaced"),
      previewPane,
      scale,
      stateKeyX: "--spaced-left",
      stateKeyY: "--spaced-top",
      onDragEnd: saveLayout,
    });
    makeDraggable({
      element: document.getElementById("prev-text-title"),
      previewPane,
      scale,
      stateKeyX: "--title-left",
      stateKeyY: "--title-top",
      onDragEnd: saveLayout,
    });
  }

  // NÂNG CẤP v11.0: Sửa logic Popup
  function initPopup() {
    const POPUP_KEY = "wmsLabelVisited_v11"; // <-- Đổi key

    // Luôn kiểm tra, bất kể reset
    if (!localStorage.getItem(POPUP_KEY)) {
      introPopup.classList.remove("hidden");
    }

    popupCloseBtn.addEventListener("click", () => {
      introPopup.classList.add("hidden");
      localStorage.setItem(POPUP_KEY, "true");
    });

    const resetBtn = document.getElementById("reset-layout-button");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        loadLayout(true); // force reset
        updatePreview(appState.longestLabel);

        // Hiển thị lại popup
        localStorage.removeItem(POPUP_KEY);
        introPopup.classList.remove("hidden");
      });
    }
  }

  // --- HÀM KHỞI ĐỘNG APP CHÍNH ---
  function initializeApp() {
    loadLayout();
    initDropZone();
    initLayoutInputs();
    initPopup(); // <-- Gọi logic popup

    document
      .getElementById("print-button")
      .addEventListener("click", () =>
        handlePrint(appState.locations, layoutState)
      );
  }

  // --- CHẠY APP ---
  initializeApp();
});
