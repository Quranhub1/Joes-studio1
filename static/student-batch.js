/* Joes Studio Student Batch workflow
 * Uses the existing Fabric/XLSX/jsPDF pipeline and keeps all source files local.
 */
(function () {
  const Batch = {
    state: {
      templateFile: null,
      templateName: "",
      rows: [],
      headers: [],
      mapping: {},
      sheetSize: "A4",
      margin: 5,
      gapX: 3,
      gapY: 3,
      copies: 1,
      columns: 0,
      rowsPerPage: 0,
    },

    normalize(value) {
      return String(value ?? "")
        .toLowerCase()
        .replace(/[\s_\-.()/\\]+/g, "")
        .replace(/[^a-z0-9]/g, "");
    },

    open() {
      document.getElementById("studentBatchModal")?.classList.remove("hidden");
      this.refresh();
    },

    close() {
      document.getElementById("studentBatchModal")?.classList.add("hidden");
    },

    async chooseTemplate() {
      const input = document.getElementById("studentBatchTemplateInput");
      if (!input) return;
      input.value = "";
      input.click();
    },

    async loadTemplate(file) {
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || (!data.canvasData && !data.objects && !data.settings)) {
          throw new Error("This is not a valid Joes Studio paper template.");
        }
        this.state.templateFile = file;
        this.state.templateName = file.name;
        await App.io.loadProjectData(data);
        this.refresh();
        Utils.toast("Template loaded: " + file.name);
      } catch (e) {
        console.error(e);
        Utils.toast("Template could not be loaded: " + e.message, "error");
      }
    },

    chooseExcel() {
      const input = document.getElementById("studentBatchExcelInput");
      if (!input) return;
      input.value = "";
      input.click();
    },

    async loadExcel(file) {
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("The workbook has no worksheets.");
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          raw: false,
          dateNF: "yyyy-mm-dd",
          defval: "",
        });
        if (!rows.length) throw new Error("The selected worksheet contains no student records.");

        this.state.rows = rows;
        this.state.headers = Object.keys(rows[0]);
        this.state.mapping = this.autoMap();
        this.refresh();
        Utils.toast(rows.length + " student records loaded");
      } catch (e) {
        console.error(e);
        Utils.toast("Excel import failed: " + e.message, "error");
      }
    },

    autoMap() {
      const headers = this.state.headers;
      const map = {};
      const aliases = {
        name: ["name", "studentname", "fullname", "studentfullname", "student"],
        studentname: ["studentname", "name", "fullname", "studentfullname"],
        regno: ["regno", "registrationno", "registrationnumber", "admissionno", "studentno", "studentnumber", "id"],
        registrationnumber: ["registrationnumber", "registrationno", "regno", "admissionno"],
        class: ["class", "classroom", "form", "grade", "level"],
        gender: ["gender", "sex"],
        dob: ["dob", "dateofbirth", "birthdate", "birthday"],
        photo: ["photo", "photofile", "photo_filename", "image", "imagefile", "picture"],
        barcode: ["barcode", "barcodeno", "barcodevalue"],
        qr: ["qr", "qrcode", "qrvalue"],
      };

      const findHeader = (field) => {
        const n = this.normalize(field);
        let found = headers.find(h => this.normalize(h) === n);
        if (found) return found;
        const candidates = aliases[n] || [n];
        found = headers.find(h => candidates.includes(this.normalize(h)));
        if (found) return found;
        return headers.find(h => {
          const hn = this.normalize(h);
          return candidates.some(c => hn.includes(c) || c.includes(hn));
        });
      };

      const objects = App.canvas?.getObjects?.() || [];
      objects.forEach(obj => {
        if (!obj.dataBinding || obj.dataBinding.type !== "variable") return;
        const field = obj.dataBinding.field || obj.rawContent || obj.text || "";
        const clean = String(field).replace(/^\{\{|\}\}$/g, "").trim();
        const header = findHeader(clean);
        if (header) {
          map[clean] = header;
          obj.dataBinding.field = header;\n          obj.dataBinding.sheet = "Batch";
        }
      });

      return map;
    },

    getCardSize() {
      const paper = App.state.currentPaper || {};
      return {
        w: Number(paper.w) / 3.7795275591,
        h: Number(paper.h) / 3.7795275591,
      };
    },

    getSheetSize() {
      const sizes = {
        A4: [210, 297],
        A3: [297, 420],
        A5: [148, 210],
        B4: [250, 353],
        B5: [176, 250],
        Letter: [215.9, 279.4],
        Legal: [215.9, 355.6],
      };
      const [w, h] = sizes[this.state.sheetSize] || sizes.A4;
      return { w, h };
    },

    layout() {
      const card = this.getCardSize();
      const sheet = this.getSheetSize();
      const margin = Number(this.state.margin) || 0;
      const gx = Number(this.state.gapX) || 0;
      const gy = Number(this.state.gapY) || 0;
      const cols = Math.max(1, Math.floor((sheet.w - margin * 2 + gx) / (card.w + gx)));
      const rows = Math.max(1, Math.floor((sheet.h - margin * 2 + gy) / (card.h + gy)));
      this.state.columns = cols;
      this.state.rowsPerPage = rows;
      return { card, sheet, cols, rows, perPage: cols * rows };
    },

    refresh() {
      const fileEl = document.getElementById("studentBatchTemplateName");
      const excelEl = document.getElementById("studentBatchExcelName");
      const countEl = document.getElementById("studentBatchCount");
      const layoutEl = document.getElementById("studentBatchLayout");
      if (fileEl) fileEl.textContent = this.state.templateName || "No template selected";
      if (excelEl) excelEl.textContent = this.state.rows.length ? "Excel data loaded" : "No Excel file selected";
      if (countEl) countEl.textContent = String(this.state.rows.length);
      const l = this.layout();
      if (layoutEl) layoutEl.textContent = l.cols + " × " + l.rows + " = " + l.perPage + " cards per " + this.state.sheetSize;
      const generate = document.getElementById("studentBatchGenerate");
      if (generate) generate.disabled = !this.state.rows.length || !this.state.templateFile;
    },

    async generate() {
      if (!this.state.rows.length || !this.state.templateFile) {
        Utils.toast("Select a template and Excel data first.", "error");
        return;
      }

      const layout = this.layout();
      const totalCards = this.state.rows.length * Math.max(1, Number(this.state.copies) || 1);
      const totalPages = Math.ceil(totalCards / layout.perPage);
      const originalIndex = App.state.currentDataIndex || 0;
      const originalSheet = App.state.dataSource.currentSheet;
      const originalOnly = App.state.printCurrentOnly;
      const oldData = App.state.dataSource.data;
      const oldHeaders = App.state.dataSource.headers;
      const oldActive = App.state.dataSource.isActive;

      const pdf = new window.jspdf.jsPDF({
        orientation: layout.sheet.w > layout.sheet.h ? "l" : "p",
        unit: "mm",
        format: [layout.sheet.w, layout.sheet.h],
        compress: true,
      });

      try {
        App.state.printCurrentOnly = false;
        App.state.dataSource.data = this.state.rows;
        App.state.dataSource.headers = this.state.headers;
        App.state.dataSource.isActive = true;
        App.state.dataSource.currentSheet = originalSheet || "Batch";
        App.state.dataSource.workbook = null;

        const first = App.canvas.getObjects().find(o => o.dataBinding?.type === "variable");
        if (!first && !App.canvas.getObjects().some(o => o.isSerialNumber || o.isDynamicPageNum)) {
          Utils.toast("No variable fields are bound in this template. Bind the card fields first.", "error");
          return;
        }

        App.ui.showLoading("Preparing batch...");
        for (let i = 0; i < totalCards; i++) {
          const studentIndex = i % this.state.rows.length;
          await App.dataSource.renderPage(studentIndex);

          const exportCanvas = await App.io._getExportCanvas();
          exportCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
          const svg = exportCanvas.toSVG({
            suppressPreamble: true,
            viewBox: { x: 0, y: 0, width: App.state.baseWidth, height: App.state.baseHeight }
          });
          exportCanvas.dispose();

          if (i > 0 && i % layout.perPage === 0) pdf.addPage([layout.sheet.w, layout.sheet.h], layout.sheet.w > layout.sheet.h ? "l" : "p");

          const slot = i % layout.perPage;
          const col = slot % layout.cols;
          const row = Math.floor(slot / layout.cols);
          const x = layout.sheet.w === layout.card.w ? 0 : Number(this.state.margin) + col * (layout.card.w + Number(this.state.gapX));
          const y = layout.sheet.h === layout.card.h ? 0 : Number(this.state.margin) + row * (layout.card.h + Number(this.state.gapY));

          await pdf.svg(new DOMParser().parseFromString(svg, "image/svg+xml").documentElement, {
            x, y, width: layout.card.w, height: layout.card.h
          });

          if ((i + 1) % Math.max(1, Math.floor(totalCards / 20)) === 0 || i === totalCards - 1) {
            App.ui.showLoading("Generating card " + (i + 1) + " of " + totalCards + "...");
          }
        }

        const safeName = (this.state.templateName || "student_cards").replace(/\.paper$/i, "").replace(/[^a-z0-9_-]+/gi, "_");
        pdf.save(safeName + "_batch_" + new Date().toISOString().slice(0, 10) + ".pdf");
        Utils.toast("Batch complete: " + totalCards + " cards on " + totalPages + " pages.");
      } catch (e) {
        console.error(e);
        Utils.toast("Batch generation failed: " + e.message, "error");
      } finally {
        App.state.dataSource.data = oldData;
        App.state.dataSource.headers = oldHeaders;
        App.state.dataSource.isActive = oldActive;
        App.state.printCurrentOnly = originalOnly;
        await App.dataSource.renderPage(originalIndex);
        App.ui.hideLoading();
      }
    }
  };

  window.JoesStudentBatch = Batch;
  window.addEventListener("load", () => {
    document.getElementById("studentBatchTemplateInput")?.addEventListener("change", e => Batch.loadTemplate(e.target.files[0]));
    document.getElementById("studentBatchExcelInput")?.addEventListener("change", e => Batch.loadExcel(e.target.files[0]));
    ["studentBatchSheetSize", "studentBatchMargin", "studentBatchGapX", "studentBatchGapY", "studentBatchCopies"].forEach(id => {
      document.getElementById(id)?.addEventListener("input", () => {
        if (id === "studentBatchSheetSize") Batch.state.sheetSize = document.getElementById(id).value;
        else Batch.state[id.replace("studentBatch", "").toLowerCase()] = Number(document.getElementById(id).value);
        Batch.refresh();
      });
    });
    Batch.refresh();
  });
})();
