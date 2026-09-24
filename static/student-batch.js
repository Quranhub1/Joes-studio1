(function () {
  const Batch = {
    state: {
      templateFile: null,
      templateName: "",
      templateMode: "",
      htmlText: "",
      htmlRoot: null,
      htmlStyles: "",
      templateFields: [],
      matchedFields: [],
      rows: [],
      headers: [],
      mapping: {},
      photoFiles: new Map(),
      sheetSize: "A4",
      margin: 5,
      gapX: 3,
      gapY: 3,
      copies: 1,
      columns: 0,
      rowsPerPage: 0,
      cardWidthMm: 130,
      cardHeightMm: 60,
      orientation: "portrait",
      cardsPerPage: 6,
      resolution: 300,
      embeddedPhotos: new Map(),
      badgeFile: null,
      badgeDataUrl: "",
    },

    notify(msg, type = "info") {
      if (window.Utils?.toast) {
        window.Utils.toast(msg, type);
      } else if (window.toast) {
        window.toast(msg, type);
      } else {
        console.log("[" + String(type).toUpperCase() + "] " + msg);
      }
    },

    showLoading(msg) {
      if (window.App?.ui?.showLoading) window.App.ui.showLoading(msg);
      else if (window.Utils?.showLoading) window.Utils.showLoading(msg);
    },

    hideLoading() {
      if (window.App?.ui?.hideLoading) window.App.ui.hideLoading();
      else if (window.Utils?.hideLoading) window.Utils.hideLoading();
    },

    normalize(value) {
      return String(value ?? "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[\s_\-.()/\\]+/g, "")
        .replace(/[^a-z0-9]/g, "");
    },

    // Always render the exact card element from the selected HTML file.
    findHtmlCardRoot(doc) {
      return doc.querySelector(
        "#exam-card, [data-card], .card-container, .exam-card, .student-card, " +
        "#student-card, .id-card, #id-card, .card"
      ) || doc.body;
    },

    open() {
      document.getElementById("studentBatchModal")?.classList.remove("hidden");
      this.refresh();
    },

    close() {
      document.getElementById("studentBatchModal")?.classList.add("hidden");
      this.cleanupPreview();
    },

    chooseTemplate() {
      const input = document.getElementById("studentBatchTemplateInput");
      if (input) {
        input.value = "";
        input.click();
      }
    },

    chooseExcel() {
      const input = document.getElementById("studentBatchExcelInput");
      if (input) {
        input.value = "";
        input.click();
      }
    },

    choosePhotos() {
      const input = document.getElementById("studentBatchPhotoInput");
      if (input) {
        input.value = "";
        input.click();
      }
    },

    chooseBadge() {
      const input = document.getElementById("studentBatchBadgeInput");
      if (input) {
        input.value = "";
        input.click();
      }
    },

    async loadTemplate(file) {
      if (!file) return;
      try {
        const text = await file.text();
        const ext = file.name.split(".").pop().toLowerCase();
        this.state.templateFile = file;
        this.state.templateName = file.name;

        if (ext === "html" || ext === "htm") {
          await this.loadHtmlTemplate(text);
        } else {
          const data = JSON.parse(text);
          if (!data || (!data.canvasData && !data.objects && !data.settings)) {
            throw new Error("This is not a valid Joes Studio .paper template.");
          }
          this.state.templateMode = "paper";
          this.state.htmlText = "";
          this.state.htmlRoot = null;
          this.state.templateFields = [];
          if (window.App?.io?.loadProjectData) await window.App.io.loadProjectData(data);
          this.state.cardWidthMm = this.getPaperWidthMm();
          this.state.cardHeightMm = this.getPaperHeightMm();
          this.state.mapping = this.autoMapPaper();
          this.refresh();
          this.notify("Paper template loaded: " + file.name);
        }
      } catch (e) {
        console.error(e);
        this.state.templateFile = null;
        this.notify("Template could not be loaded: " + e.message, "error");
      }
    },

    async loadHtmlTemplate(text) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());

      let styles = Array.from(doc.querySelectorAll("style"))
        .map(s => s.textContent || "")
        .join("\n");

      // Clean unwanted underline borders
      styles += "\n.detail-value { border-bottom: none !important; }\n";

      const cardRoot = this.findHtmlCardRoot(doc);
      if (!cardRoot || !cardRoot.innerHTML.trim()) throw new Error("The HTML template is empty.");

      const fields = this.detectPlaceholders(text);

      this.state.templateMode = "html";
      this.state.htmlText = text;
      this.state.htmlRoot = cardRoot;
      this.state.htmlStyles = styles;
      this.state.templateFields = fields;

      const size = this.detectHtmlCardSize(doc, cardRoot);
      this.state.cardWidthMm = size.w;
      this.state.cardHeightMm = size.h;

      this.state.mapping = this.autoMapHtml();
      this.refresh();
      this.previewBatch();
      this.notify("HTML template loaded: " + fileNameSafe(this.state.templateName) + " • " + fields.length + " fields detected");
    },

    detectPlaceholders(text) {
      const found = [];
      const seen = new Set();

      const add = value => {
        const field = String(value || "").trim();
        if (!field) return;
        const key = this.normalize(field);

        if (
          key === "photoplaceholder" ||
          key === "passportphotoplaceholder" ||
          key === "badgeplaceholder"
        ) return;

        if (key && !seen.has(key)) {
          seen.add(key);
          found.push(field);
        }
      };

      const mustache = /{{\s*([^{}]+?)\s*}}/g;
      let m;
      while ((m = mustache.exec(text))) add(m[1]);

      try {
        const doc = new DOMParser().parseFromString(text, "text/html");

        doc.querySelectorAll(
          "[data-bind],[data-field],[data-bind-src],[data-bind-qr],[data-bind-barcode]"
        ).forEach(el => {
          [
            "data-bind",
            "data-field",
            "data-bind-src",
            "data-bind-qr",
            "data-bind-barcode"
          ].forEach(attr => {
            const value = el.getAttribute(attr);
            if (value) add(value.replace(/^{{\s*|\s*}}$/g, ""));
          });
        });

        doc.querySelectorAll("[id]").forEach(el => {
          const id = String(el.id || "").trim();

          const outMatch = id.match(/^out[-_](.+)$/i);
          if (outMatch) {
            const name = outMatch[1].replace(/[-_]+/g, " ");
            if (!/^(photo[-_]?placeholder|badge[-_]?placeholder)$/i.test(name)) {
              add(name);
            }
            return;
          }

          const fieldMatch = id.match(/^(?:field|data)[-_](.+)$/i);
          if (fieldMatch) {
            add(fieldMatch[1].replace(/[-_]+/g, " "));
            return;
          }

          const inMatch = id.match(/^in[-_](.+)$/i);
          if (inMatch) {
            const name = inMatch[1].replace(/[-_]+/g, " ");
            const tag = el.tagName.toLowerCase();
            const type = String(el.getAttribute("type") || "").toLowerCase();
            const isDataInput = ["text","number","date","email","tel","search",""].includes(type);
            const isOutputPaired = !!doc.querySelector("#out-" + inMatch[1] + ", #out_" + inMatch[1]);
            const isControl = /^(?:badge[-_]?(?:file|url)|file|url|button|submit|reset|search)$/i.test(inMatch[1]);

            if (!isControl && (isDataInput || isOutputPaired || tag === "select" || tag === "textarea")) {
              add(name);
            }
          }
        });
      } catch (_) {}

      return found;
    },

    detectHtmlCardSize(doc, root) {
      const attrW = root.getAttribute("data-card-width-mm") || root.querySelector("[data-card-width-mm]")?.getAttribute("data-card-width-mm");
      const attrH = root.getAttribute("data-card-height-mm") || root.querySelector("[data-card-height-mm]")?.getAttribute("data-card-height-mm");
      if (Number(attrW) > 0 && Number(attrH) > 0) return { w: Number(attrW), h: Number(attrH) };

      const css = Array.from(doc.querySelectorAll("style")).map(s => s.textContent || "").join("\n");
      const classMatch = css.match(/(?:\.exam-card|\.student-card|\.card|\#student-card|\#card)[^{]*\{([^}]*)\}/i);
      const block = classMatch ? classMatch[1] : css;
      const w = this.parseCssLength((block.match(/\bwidth\s*:\s*([^;]+)/i) || [])[1]);
      const h = this.parseCssLength((block.match(/\bheight\s*:\s*([^;]+)/i) || [])[1]);
      if (w > 0 && h > 0) return { w, h };

      const page = css.match(/@page[^\{]*\{[^}]*size\s*:\s*([^;]+);?/i);
      if (page) {
        const nums = page[1].match(/([\d.]+)\s*(mm|cm|in|px|pt)?\s+([\d.]+)\s*(mm|cm|in|px|pt)?/i);
        if (nums) return { w: this.toMm(nums[1], nums[2]), h: this.toMm(nums[3], nums[4]) };
      }

      return { w: 130, h: 60 };
    },

    parseCssLength(value) {
      if (!value) return 0;
      const m = String(value).trim().match(/^([\d.]+)\s*(mm|cm|in|px|pt)?$/i);
      return m ? this.toMm(m[1], m[2]) : 0;
    },

    toMm(value, unit) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      switch (String(unit || "px").toLowerCase()) {
        case "cm": return n * 10;
        case "in": return n * 25.4;
        case "pt": return n * 25.4 / 72;
        case "mm": return n;
        default: return n * 25.4 / 96;
      }
    },

    findHeader(field) {
      const headers = this.state.headers || [];
      const key = this.normalize(field);
      if (!key) return null;

      const exact = headers.filter(header => this.normalize(header) === key);
      return exact.length === 1 ? exact[0] : null;
    },

    getHeaderSuggestion(field) {
      const headers = this.state.headers || [];
      const key = this.normalize(field);
      if (!key || !headers.length) return null;

      const scored = headers.map(header => {
        const value = this.normalize(header);
        if (!value) return { header, score: 0 };
        let score = 0;
        if (value.includes(key) || key.includes(value)) score = 50;
        let common = 0;
        const limit = Math.min(key.length, value.length);
        for (let i = 0; i < limit; i++) {
          if (key[i] === value[i]) common++;
          else break;
        }
        score = Math.max(score, common / Math.max(key.length, value.length) * 100);
        return { header, score };
      }).sort((x, y) => y.score - x.score);

      return scored[0]?.score >= 60 ? scored[0].header : null;
    },

    autoMapHtml() {
      const map = {};
      this.state.templateFields.forEach(field => {
        const header = this.findHeader(field);
        if (header) map[field] = header;
      });
      this.state.matchedFields = this.state.templateFields.map(field => ({
        field,
        header: map[field] || null
      }));
      return map;
    },

    renderFieldMapping(host) {
      if (!host) return;

      if (!this.state.templateFields.length) {
        host.innerHTML = '<span class="text-slate-400">Load an HTML template to detect its fields.</span>';
        return;
      }

      if (!this.state.headers.length) {
        host.innerHTML =
          '<div class="text-slate-400">Template fields detected. Import the Excel sheet to map them to its real column headers.</div>' +
          '<div class="mt-2 text-[10px] text-slate-400">' +
          escapeHtml(this.state.templateFields.join(", ")) + '</div>';
        return;
      }

      const options = this.state.headers.map(header =>
        '<option value="' + escapeHtml(header) + '">' + escapeHtml(header) + '</option>'
      ).join("");

      host.innerHTML = this.state.templateFields.map(field => {
        const selected = this.state.mapping[field] || "";
        const suggestion = !selected ? this.getHeaderSuggestion(field) : null;
        const suggestionText = suggestion
          ? ' <span class="text-[9px] text-slate-400">suggestion: ' + escapeHtml(suggestion) + '</span>'
          : "";

        if (this.isBadgeField(field)) {
          const fileName = this.state.badgeFile?.name || "Using template logo";
          const buttonText = this.state.badgeDataUrl ? "Replace Logo" : "Upload Custom Logo";
          const preview = this.state.badgeDataUrl
            ? '<img src="' + this.imageSourceForTemplate(this.state.badgeDataUrl) + '" alt="" class="h-10 w-10 object-contain rounded border border-slate-200 bg-white p-1">'
            : '<div class="h-10 w-10 rounded border border-dashed border-slate-300 bg-white flex items-center justify-center"><i class="ph ph-image text-slate-300"></i></div>';

          return '<div class="grid grid-cols-[minmax(130px,1fr)_minmax(160px,1fr)] items-center gap-3 py-2">' +
            '<div class="min-w-0"><div class="font-mono text-[11px] text-slate-700 truncate">{{' + escapeHtml(field) + '}}</div>' +
            '<div class="text-[9px] text-slate-400">School Badge / Logo (Optional upload)</div></div>' +
            '<div class="flex items-center gap-2 min-w-0">' +
            preview +
            '<button type="button" class="student-batch-badge-button flex-1 min-w-0 border rounded-lg px-3 py-2 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50" data-template-field="' + escapeHtml(field) + '">' +
            '<i class="ph ph-upload-simple mr-1"></i>' + buttonText + '</button>' +
            '<span class="text-[9px] text-slate-400 truncate max-w-[110px]" title="' + escapeHtml(fileName) + '">' + escapeHtml(fileName) + '</span>' +
            '</div>' +
            '</div>';
        }

        const isPhoto = this.isStudentPhotoField(field);
        const helper = isPhoto
          ? ' <span class="text-[9px] text-emerald-600 font-medium">auto-matched to Excel/Photos</span>'
          : suggestionText;

        return '<div class="grid grid-cols-[minmax(130px,1fr)_minmax(160px,1fr)] items-center gap-3 py-2">' +
          '<div class="min-w-0"><div class="font-mono text-[11px] text-slate-700 truncate">{{' + escapeHtml(field) + '}}</div>' +
          '<div class="text-[9px] text-slate-400">Template field' + helper + '</div></div>' +
          '<select class="student-batch-map-select w-full border rounded-lg p-2 bg-white text-xs" data-template-field="' + escapeHtml(field) + '">' +
          '<option value="">' + (isPhoto ? 'Auto-detect from Excel / Folder' : 'Do not map / leave blank') + '</option>' +
          options.replace(
            '<option value="' + escapeHtml(selected) + '">',
            '<option value="' + escapeHtml(selected) + '" selected>'
          ) +
          '</select>' +
          '</div>';
      }).join("");

      host.querySelectorAll(".student-batch-map-select").forEach(select => {
        select.addEventListener("change", e => {
          const field = e.currentTarget.getAttribute("data-template-field") || "";
          const value = e.currentTarget.value || "";
          if (value) this.state.mapping[field] = value;
          else delete this.state.mapping[field];

          this.state.matchedFields = this.state.templateFields.map(name => ({
            field: name,
            header: this.state.mapping[name] || null
          }));
          this.refresh();
        });
      });

      host.querySelectorAll(".student-batch-badge-button").forEach(button => {
        button.addEventListener("click", () => this.chooseBadge());
      });
    },

    autoMapPaper() {
      const map = {};
      const objects = window.App?.canvas?.getObjects?.() || [];
      objects.forEach(obj => {
        if (!obj.dataBinding || obj.dataBinding.type !== "variable") return;
        const field = String(obj.dataBinding.field || obj.rawContent || obj.text || "").replace(/^\{\{|\}\}$/g, "").trim();
        const header = this.findHeader(field);
        if (header) {
          map[field] = header;
          obj.dataBinding.field = header;
          obj.dataBinding.sheet = "Batch";
        }
      });
      this.state.templateFields = Object.keys(map);
      this.state.matchedFields = this.state.templateFields.map(field => ({ field, header: map[field] || null }));
      return map;
    },

    async extractEmbeddedExcelImages(buffer) {
      const result = new Map();
      if (!window.JSZip) return result;

      try {
        const zip = await window.JSZip.loadAsync(buffer);
        const sheetNameByPath = {};
        const workbookFile = zip.file("xl/workbook.xml");
        const workbookRelFile = zip.file("xl/_rels/workbook.xml.rels");

        if (workbookFile && workbookRelFile) {
          const workbookDoc = new DOMParser().parseFromString(
            await workbookFile.async("text"),
            "application/xml"
          );
          const workbookRelDoc = new DOMParser().parseFromString(
            await workbookRelFile.async("text"),
            "application/xml"
          );
          const workbookRelMap = {};
          Array.from(workbookRelDoc.getElementsByTagName("*")).forEach(rel => {
            if (rel.localName.toLowerCase() !== "relationship") return;
            const id = rel.getAttribute("Id");
            const target = rel.getAttribute("Target");
            if (id && target) {
              workbookRelMap[id] = this.resolveZipPath("xl/_rels/workbook.xml.rels", target);
            }
          });
          Array.from(workbookDoc.getElementsByTagName("*")).forEach(sheet => {
            if (sheet.localName.toLowerCase() !== "sheet") return;
            const name = sheet.getAttribute("name");
            const relId =
              sheet.getAttribute("r:id") ||
              sheet.getAttribute("id") ||
              Array.from(sheet.attributes).find(a => a.localName === "id")?.value;
            if (name && relId && workbookRelMap[relId]) {
              sheetNameByPath[workbookRelMap[relId]] = name;
            }
          });
        }

        const sheetFiles = Object.keys(zip.files).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path));

        for (const sheetPath of sheetFiles) {
          const sheetRelPath = sheetPath.replace("xl/worksheets/", "xl/worksheets/_rels/") + ".rels";
          const sheetFile = zip.file(sheetPath);
          const relFile = zip.file(sheetRelPath);
          if (!sheetFile || !relFile) continue;

          const relXml = await relFile.async("text");
          const relDoc = new DOMParser().parseFromString(relXml, "application/xml");
          const relMap = {};

          Array.from(relDoc.getElementsByTagName("*")).forEach(rel => {
            if (rel.localName.toLowerCase() === "relationship") {
              const id = rel.getAttribute("Id");
              const target = rel.getAttribute("Target");
              if (id && target) relMap[id] = this.resolveZipPath(sheetRelPath, target);
            }
          });

          const sheetXml = await sheetFile.async("text");
          const sheetDoc = new DOMParser().parseFromString(sheetXml, "application/xml");
          const drawingNode = Array.from(sheetDoc.getElementsByTagName("*")).find(el => el.localName.toLowerCase() === "drawing");
          if (!drawingNode) continue;

          const drawingRelId =
            drawingNode.getAttribute("r:id") ||
            drawingNode.getAttribute("id") ||
            Array.from(drawingNode.attributes).find(a => a.localName === "id")?.value;
          const drawingPath = relMap[drawingRelId];
          if (!drawingPath) continue;

          const drawingFile = zip.file(drawingPath);
          const drawingRelPath = this.zipSiblingRelsPath(drawingPath);
          const drawingRelFile = zip.file(drawingRelPath);
          if (!drawingFile || !drawingRelFile) continue;

          const drawingRelXml = await drawingRelFile.async("text");
          const drawingRelDoc = new DOMParser().parseFromString(drawingRelXml, "application/xml");
          const imageMap = {};
          Array.from(drawingRelDoc.getElementsByTagName("*")).forEach(rel => {
            if (rel.localName.toLowerCase() === "relationship") {
              const id = rel.getAttribute("Id");
              const target = rel.getAttribute("Target");
              if (id && target) imageMap[id] = this.resolveZipPath(drawingRelPath, target);
            }
          });

          const drawingXml = await drawingFile.async("text");
          const drawingDoc = new DOMParser().parseFromString(drawingXml, "application/xml");
          const anchors = Array.from(drawingDoc.getElementsByTagName("*")).filter(el =>
            ["twocellanchor", "onecellanchor"].includes(el.localName.toLowerCase())
          );

          for (const anchor of anchors) {
            const fromNode = Array.from(anchor.getElementsByTagName("*")).find(el => el.localName.toLowerCase() === "from");
            const blipNode = Array.from(anchor.getElementsByTagName("*")).find(el => el.localName.toLowerCase() === "blip");
            if (!fromNode || !blipNode) continue;

            const rowNode = Array.from(fromNode.getElementsByTagName("*")).find(el => el.localName.toLowerCase() === "row");
            const relId =
              blipNode.getAttribute("r:embed") ||
              blipNode.getAttribute("embed") ||
              Array.from(blipNode.attributes).find(a => a.localName === "embed")?.value;
            const row = Number(rowNode?.textContent);
            const imagePath = imageMap[relId];
            if (!Number.isFinite(row) || !imagePath) continue;

            const imageFile = zip.file(imagePath.replace(/^\//, ""));
            if (!imageFile) continue;

            const blob = await imageFile.async("blob");
            const dataUrl = await this.fileToDataUrl(blob);
            if (dataUrl) {
              const worksheetName = sheetNameByPath[sheetPath] || sheetPath;
              result.set(worksheetName + "::" + row, dataUrl);
              result.set("row::" + row, dataUrl);
            }
          }
        }
      } catch (error) {
        console.warn("Embedded Excel image extraction failed:", error);
      }

      return result;
    },

    resolveZipPath(referencePath, target) {
      const cleanTarget = String(target || "").split("#")[0];
      const base = referencePath.split("/");
      base.pop();

      if (base[base.length - 1] === "_rels") base.pop();

      for (const part of cleanTarget.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") base.pop();
        else base.push(part);
      }
      return base.join("/");
    },

    zipSiblingRelsPath(path) {
      const parts = path.split("/");
      const file = parts.pop();
      return parts.concat(["_rels", file + ".rels"]).join("/");
    },

    async loadExcel(file) {
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        this.state.embeddedPhotos = await this.extractEmbeddedExcelImages(buffer);
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("The workbook has no worksheets.");
        const worksheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          dateNF: "yyyy-mm-dd",
          defval: "",
          blankrows: true
        });

        const nonEmpty = row => row.filter(v => String(v ?? "").trim() !== "");
        const normalizedCells = row => nonEmpty(row).map(v => this.normalize(v)).filter(Boolean);
        const keywordScore = row => {
          const text = normalizedCells(row).join(" ");
          const keys = [
            "name","student","registration","regno","admission","studentno","studentnumber",
            "id","course","programme","program","class","stream","gender","sex","dob",
            "dateofbirth","photo","image","picture","sitting","exam","issuedby","year"
          ];
          return keys.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
        };

        const scan = matrix.slice(0, Math.min(matrix.length, 150));
        let headerIndex = -1;
        let bestScore = -Infinity;

        scan.forEach((candidate, i) => {
          const headerCells = normalizedCells(candidate);
          if (!headerCells.length) return;

          const width = headerCells.length;
          const candidateHeaders = new Set(headerCells);
          let usableRows = 0;
          let populatedCells = 0;

          for (let j = i + 1; j < matrix.length; j++) {
            const row = matrix[j];
            const cells = nonEmpty(row);
            if (!cells.length) continue;

            const filled = row.slice(0, Math.max(width, 1)).filter(v => String(v ?? "").trim() !== "").length;
            if (filled > 0) {
              usableRows++;
              populatedCells += filled;
            }

            if (usableRows >= 50) break;
          }

          const keyword = keywordScore(candidate);
          const unique = candidateHeaders.size;
          const hasEnoughColumns = width >= 2;
          const dataEvidence = Math.min(usableRows, 30);
          const density = usableRows ? populatedCells / Math.max(1, usableRows * width) : 0;

          let score = dataEvidence * 100 + keyword * 20 + Math.min(width, 50) + unique;
          score += hasEnoughColumns ? 25 : -20;
          score += Math.round(density * 20);

          if (score > bestScore) {
            bestScore = score;
            headerIndex = i;
          }
        });

        if (headerIndex < 0) {
          throw new Error("The selected worksheet contains no readable table.");
        }

        const rawHeaders = matrix[headerIndex] || [];
        const headers = [];
        const used = new Set();
        rawHeaders.forEach((value, i) => {
          let header = String(value ?? "").trim();
          if (!header) header = "Column " + columnName(i);
          let base = header;
          let n = 2;
          while (used.has(this.normalize(header))) header = base + " " + n++;
          used.add(this.normalize(header));
          headers.push(header);
        });

        const dataMatrix = matrix
          .slice(headerIndex + 1)
          .map((row, offset) => ({
            values: row,
            worksheetRowIndex: headerIndex + 1 + offset
          }))
          .filter(item => nonEmpty(item.values).length > 0);

        const rows = dataMatrix.map(item => {
          const obj = {};
          headers.forEach((header, i) => {
            obj[header] = item.values[i] ?? "";
          });
          Object.defineProperty(obj, "__worksheetRowIndex", {
            value: item.worksheetRowIndex,
            enumerable: false,
            configurable: true
          });
          return obj;
        });

        if (!rows.length) {
          throw new Error("The selected worksheet has headers but no student records. Choose the sheet containing the student table.");
        }

        this.state.rows = rows.map(row => {
          const copy = { ...row };
          const excelRowIndex = Number(row.__worksheetRowIndex);
          const embedded =
            this.state.embeddedPhotos.get(sheetName + "::" + excelRowIndex) ||
            this.state.embeddedPhotos.get("row::" + excelRowIndex);
          if (embedded) copy.__embeddedPhoto = embedded;
          return copy;
        }).filter(row =>
          Object.keys(row).some(key => key !== "__worksheetRowIndex" && String(row[key] ?? "").trim() !== "") ||
          !!row.__embeddedPhoto
        );

        this.state.headers = headers;
        if (this.state.templateMode === "html") this.state.mapping = this.autoMapHtml();
        else if (this.state.templateMode === "paper") this.state.mapping = this.autoMapPaper();
        this.refresh();
        this.notify(rows.length + " student records loaded • " + Object.keys(this.state.mapping).length + " fields matched");
      } catch (e) {
        console.error(e);
        this.notify("Excel import failed: " + e.message, "error");
      }
    },

    async loadPhotos(files) {
      this.state.photoFiles.clear();
      for (const file of Array.from(files || [])) {
        this.state.photoFiles.set(file.name.toLowerCase(), file);
        this.state.photoFiles.set(file.name.replace(/\.[^.]+$/, "").toLowerCase(), file);
      }
      this.refresh();
      this.notify(Math.floor(this.state.photoFiles.size / 2) + " photo files indexed • Excel photo fields will be matched automatically");
    },

    async loadBadge(file) {
      if (!file) return;
      if (!/^image\//i.test(file.type || "") && !/\.(png|jpe?g|webp|svg)$/i.test(file.name || "")) {
        this.notify("Badge must be an image file (PNG, JPG, SVG).", "error");
        return;
      }

      try {
        this.state.badgeFile = file;
        this.state.badgeDataUrl = await this.fileToDataUrl(file);
        this.refresh();
        this.notify("Badge image loaded: " + file.name);
      } catch (e) {
        console.error(e);
        this.state.badgeFile = null;
        this.state.badgeDataUrl = "";
        this.notify("Badge image could not be loaded: " + e.message, "error");
      }
    },

    resolveValue(row, field) {
      if (this.isBadgeField(field) && this.state.badgeDataUrl) {
        return this.state.badgeDataUrl;
      }

      const header = this.state.mapping[field];
      if (header && row[header] !== undefined) return row[header];
      if (row[field] !== undefined) return row[field];
      const h = this.findHeader(field);
      return h && row[h] !== undefined ? row[h] : "";
    },

    displayValue(row, field) {
      const value = this.resolveValue(row, field);
      return String(value ?? "").trim() === "" ? "" : value;
    },

    async fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    isStudentPhotoField(field = "") {
      const key = this.normalize(field);
      return /(photo|studentphoto|studentimage|picture|avatar|passport)/i.test(key) &&
        !/(badge|logo|crest|emblem|seal)/i.test(key);
    },

    isBadgeField(field = "") {
      const key = this.normalize(field);
      return /(badge|logo|crest|emblem|seal)/i.test(key);
    },

    async resolvePhoto(value, row, field = "") {
      if (row?.__embeddedPhoto && (this.isStudentPhotoField(field) || !field)) {
        return row.__embeddedPhoto;
      }

      if (!value) return row?.__embeddedPhoto || "";

      const raw = String(value).trim();
      if (/^(data:|blob:|https?:)/i.test(raw)) return raw;

      const clean = raw.split(/[\\/]/).pop().trim().toLowerCase();
      const stem = clean.replace(/\.[^.]+$/, "");
      const candidates = [
        clean,
        stem,
        stem.replace(/\s+/g, ""),
        stem.replace(/[^a-z0-9]/gi, "")
      ];

      let file = null;
      for (const key of candidates) {
        file = this.state.photoFiles.get(key);
        if (file) break;
      }

      if (!file) {
        const target = this.normalize(stem);
        for (const [key, candidate] of this.state.photoFiles.entries()) {
          if (this.normalize(key.replace(/\.[^.]+$/, "")) === target) {
            file = candidate;
            break;
          }
        }
      }

      return file ? await this.fileToDataUrl(file) : (row?.__embeddedPhoto || "");
    },

    replacePlaceholders(html, row) {
      return html.replace(/{{\s*([^{}]+?)\s*}}/g, (_m, name) => {
        const field = String(name).trim();
        if (this.isImageField(field)) return "";
        return escapeHtml(this.displayValue(row, field));
      });
    },

    isImageField(field = "") {
      const key = this.normalize(field);
      return /(photo|image|picture|avatar|badge|logo|crest|emblem|seal)/i.test(key);
    },

    isImageUrl(value, field = "") {
      const raw = String(value ?? "").trim();
      if (!raw) return false;
      if (/^(?:data:image\/|blob:)/i.test(raw)) return true;
      if (!/^https?:\/\//i.test(raw)) return false;

      const name = this.normalize(field);
      if (/(badge|logo|crest|emblem|seal|photo|image|picture|avatar)/i.test(name)) return true;

      try {
        const url = new URL(raw);
        return /\.(?:png|jpe?g|gif|webp|bmp|svg|avif)(?:$|[?#])/i.test(url.pathname);
      } catch (_) {
        return /\.(?:png|jpe?g|gif|webp|bmp|svg|avif)(?:$|[?#])/i.test(raw);
      }
    },

    imageSourceForTemplate(value) {
      const raw = String(value ?? "").trim();
      if (!raw) return "";
      if (/^(?:data:|blob:)/i.test(raw)) return raw;
      if (/^https?:\/\//i.test(raw) &&
          !/^https?:\/\/(?:quranhub1\.github\.io|localhost|127\.0\.0\.1|images\.weserv\.nl)(?::\d+)?\//i.test(raw)) {
        return "https://images.weserv.nl/?url=" + encodeURIComponent(raw);
      }
      return raw;
    },

    sanitizePlaceholderImages(root) {
      if (!root) return;
      root.querySelectorAll("img").forEach(img => {
        const src = String(img.getAttribute("src") || "").trim();
        if (/{{\s*[^{}]+?\s*}}/.test(src)) {
          img.removeAttribute("src");
          img.setAttribute("data-template-image-placeholder", "true");
          img.style.visibility = "hidden";
        }
      });
    },

    async putImageIntoBoundElement(el, value, field, row) {
      const isBadge = this.isBadgeField(field);
      const isPhoto = this.isStudentPhotoField(field);
      if (!isBadge && !isPhoto) return false;

      let resolved = "";
      if (isBadge) {
        resolved = this.state.badgeDataUrl || (el.getAttribute("src") || "");
      } else {
        resolved = await this.resolvePhoto(value, row, field);
      }

      if (!resolved) return false;

      const src = this.imageSourceForTemplate(resolved);
      if (!src) return false;

      if (el.tagName === "IMG") {
        el.setAttribute("src", src);
        el.style.display = "block";
        el.removeAttribute("alt");
        return true;
      }

      const images = el.querySelectorAll("img");
      if (images.length) {
        images.forEach(img => {
          img.setAttribute("src", src);
          img.style.display = "block";
          img.removeAttribute("alt");
        });
        return true;
      }

      if (el.children.length === 0) {
        const img = document.createElement("img");
        img.setAttribute("src", src);
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.display = "block";
        el.textContent = "";
        el.appendChild(img);
        return true;
      }

      return false;
    },

    async buildHtmlCard(row) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.state.htmlText, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());

      const body = this.findHtmlCardRoot(doc);

      for (const img of Array.from(body.querySelectorAll("img"))) {
        const srcAttr = String(img.getAttribute("src") || "");
        const bindSrc = img.getAttribute("data-bind-src") || "";
        const idAttr = String(img.id || "");
        const classAttr = String(img.className || "");

        const isBadge = this.isBadgeField(idAttr) ||
          this.isBadgeField(bindSrc) ||
          this.isBadgeField(classAttr) ||
          /badge|logo/i.test(srcAttr);

        const isPhoto = this.isStudentPhotoField(idAttr) ||
          this.isStudentPhotoField(bindSrc) ||
          this.isStudentPhotoField(classAttr) ||
          /photo|picture/i.test(srcAttr) ||
          srcAttr.includes("{{");

        if (isBadge) {
          if (this.state.badgeDataUrl) {
            img.setAttribute("src", this.imageSourceForTemplate(this.state.badgeDataUrl));
          }
          img.style.display = "block";
          img.removeAttribute("alt");
        } else if (isPhoto) {
          const match = srcAttr.match(/{{\s*([^{}]+?)\s*}}/) || [null, bindSrc || "photo"];
          const field = match[1] ? match[1].trim() : "photo";
          const photoData = await this.resolvePhoto(this.resolveValue(row, field), row, field);

          const placeholder = body.querySelector(".photo-placeholder, #photo-placeholder, #out-photo-placeholder");
          if (photoData) {
            img.setAttribute("src", this.imageSourceForTemplate(photoData));
            img.style.display = "block";
            img.removeAttribute("alt");
            if (placeholder) placeholder.style.display = "none";
          } else {
            img.style.display = "none";
            img.removeAttribute("src");
            if (placeholder) placeholder.style.display = "block";
          }
        }
      }

      const html = this.replacePlaceholders(body.innerHTML, row);
      body.innerHTML = html;

      const all = body.querySelectorAll("*");

      for (const el of all) {
        for (const attr of Array.from(el.attributes)) {
          if (!attr.value.includes("{{")) continue;
          const replaced = this.replacePlaceholders(attr.value, row);
          el.setAttribute(attr.name, replaced);
        }

        // Strip unwanted underline borders on card detail rows
        if (el.classList.contains("detail-value")) {
          el.style.borderBottom = "none";
        }

        const idMatch = String(el.id || "").match(/^(?:out|in|field|data)[-_](.+)$/i);
        if (idMatch) {
          const field = idMatch[1].replace(/[-_]+/g, " ");
          if (this.isBadgeField(field)) {
            if (this.state.badgeDataUrl) {
              await this.putImageIntoBoundElement(el, this.state.badgeDataUrl, field, row);
            }
          } else if (this.isStudentPhotoField(field)) {
            const photoVal = await this.resolvePhoto(this.resolveValue(row, field), row, field);
            if (photoVal) {
              await this.putImageIntoBoundElement(el, photoVal, field, row);
            }
          } else if (!/^in[-_]/i.test(el.id)) {
            const textVal = this.displayValue(row, field);
            if (textVal) {
              el.textContent = textVal;
            } else if (/^_+$/.test(el.textContent.trim())) {
              el.textContent = "";
            }
          }
        }

        const bind = el.getAttribute("data-bind") || el.getAttribute("data-field");
        if (bind) {
          const value = this.resolveValue(row, bind);
          if (this.isImageField(bind)) {
            await this.putImageIntoBoundElement(el, value, bind, row);
          } else {
            el.textContent = this.displayValue(row, bind);
          }
        }

        const qrBind = el.getAttribute("data-bind-qr");
        const barcodeBind = el.getAttribute("data-bind-barcode");
        if ((qrBind || barcodeBind) && window.bwipjs) {
          const value = String(this.resolveValue(row, qrBind || barcodeBind) ?? "");
          try {
            const canvas = document.createElement("canvas");
            bwipjs.toCanvas(canvas, {
              bcid: qrBind ? "qrcode" : "code128",
              text: value || " ",
              scale: 3,
              includetext: false,
              padding: 0,
            });
            const img = document.createElement("img");
            img.src = canvas.toDataURL("image/png");
            el.replaceWith(img);
          } catch (e) {
            console.warn("Code generation failed", e);
          }
        }
      }

      this.sanitizePlaceholderImages(body);
      this.proxyExternalPreviewImages(body);
      return { doc, body };
    },

    async renderHtmlCard(row) {
      const { doc, body } = await this.buildHtmlCard(row);
      const wrapper = document.createElement("div");
      wrapper.style.cssText = [
        "position:fixed", "left:-100000px", "top:0", "visibility:hidden",
        "width:" + this.state.cardWidthMm + "mm",
        "height:" + this.state.cardHeightMm + "mm",
        "overflow:hidden", "background:#fff"
      ].join(";");
      const styles = document.createElement("style");
      styles.textContent = this.state.htmlStyles;
      wrapper.appendChild(styles);

      const cardClone = body.cloneNode(true);
      wrapper.appendChild(cardClone);
      document.body.appendChild(wrapper);

      const canvas = await this.domToCanvas(wrapper, this.state.cardWidthMm, this.state.cardHeightMm);
      wrapper.remove();
      return canvas;
    },

    async inlineExportImages(root) {
      const images = Array.from(root.querySelectorAll("img"));
      await Promise.all(images.map(async img => {
        const src = String(img.getAttribute("src") || "").trim();
        if (!src || /^(?:data:|blob:)/i.test(src)) return;

        img.setAttribute("crossorigin", "anonymous");
        try {
          const proxyUrl = "https://images.weserv.nl/?url=" + encodeURIComponent(src);
          const response = await fetch(proxyUrl, {
            mode: "cors",
            credentials: "omit",
            cache: "no-store"
          });

          if (!response.ok) throw new Error("Image proxy HTTP " + response.status);
          const blob = await response.blob();
          const dataUrl = await this.fileToDataUrl(blob);
          if (!dataUrl) throw new Error("Image proxy returned no usable image data");
          img.setAttribute("src", dataUrl);
        } catch (error) {
          console.warn("Could not inline card image for PDF export:", src, error);
        }
      }));
    },

    async domToCanvas(element, wMm, hMm) {
      const width = Math.max(1, Math.round(wMm * 96 / 25.4));
      const height = Math.max(1, Math.round(hMm * 96 / 25.4));
      const clone = element.cloneNode(true);
      clone.style.visibility = "visible";
      clone.style.position = "static";
      clone.style.left = "0";
      clone.style.top = "0";
      clone.style.width = width + "px";
      clone.style.height = height + "px";
      await this.inlineExportImages(clone);

      const css = this.state.htmlStyles.replace(/url\((?!['"]?(?:data:|https?:|blob:))/gi, "url(");
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">',
        "<style><![CDATA[" + css.replace(/]]>/g, "]]&gt;") + "]]></style>",
        '<foreignObject x="0" y="0" width="100%" height="100%">',
        new XMLSerializer().serializeToString(clone),
        "</foreignObject></svg>"
      ].join("");

      const img = new Image();
      img.decoding = "async";
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("The HTML card could not be rendered by the browser."));
      });

      const canvas = document.createElement("canvas");
      const scale = Math.max(1, Number(this.state.resolution) || 300) / 96;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    },

    getPaperWidthMm() {
      const paper = window.App?.state?.currentPaper || {};
      return Number(paper.w || 320) / 3.7795275591;
    },

    getPaperHeightMm() {
      const paper = window.App?.state?.currentPaper || {};
      return Number(paper.h || 226) / 3.7795275591;
    },

    getSheetSize() {
      const sizes = {
        A4: [210, 297], A3: [297, 420], A5: [148, 210],
        B4: [250, 353], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6],
      };
      let [w, h] = sizes[this.state.sheetSize] || sizes.A4;
      if (this.state.orientation === "landscape") [w, h] = [h, w];
      return { w, h };
    },

    layout() {
      const baseCard = { w: Number(this.state.cardWidthMm) || 130, h: Number(this.state.cardHeightMm) || 60 };
      const sheet = this.getSheetSize();
      const margin = Number(this.state.margin) || 0;
      const gx = Number(this.state.gapX) || 0;
      const gy = Number(this.state.gapY) || 0;
      const requested = Math.max(1, Number(this.state.cardsPerPage) || 1);

      let best = null;
      for (let cols = 1; cols <= requested; cols++) {
        const rows = Math.ceil(requested / cols);
        const availableW = sheet.w - margin * 2 - Math.max(0, cols - 1) * gx;
        const availableH = sheet.h - margin * 2 - Math.max(0, rows - 1) * gy;
        if (availableW <= 0 || availableH <= 0) continue;

        const cellW = availableW / cols;
        const cellH = availableH / rows;
        const scale = Math.min(cellW / baseCard.w, cellH / baseCard.h);
        const usedW = baseCard.w * scale;
        const usedH = baseCard.h * scale;
        const fill = (usedW * usedH) / (cellW * cellH);
        const shapePenalty = Math.abs(Math.log(cols / rows));
        const score = fill - shapePenalty * 0.03;

        if (!best || score > best.score) {
          best = { cols, rows, cellW, cellH, scale, usedW, usedH, score };
        }
      }

      if (!best) best = { cols: 1, rows: 1, cellW: sheet.w - margin * 2, cellH: sheet.h - margin * 2, scale: 1, usedW: baseCard.w, usedH: baseCard.h, score: 0 };

      const card = { w: best.usedW, h: best.usedH };
      this.state.columns = best.cols;
      this.state.rowsPerPage = best.rows;
      return {
        card,
        sheet,
        cols: best.cols,
        rows: best.rows,
        perPage: requested,
        scale: best.scale,
        cellW: best.cellW,
        cellH: best.cellH
      };
    },

    async previewBatch() {
      const host = document.getElementById("studentBatchPrintPreview");
      if (!host || this.state.templateMode !== "html" || !this.state.htmlText) {
        if (host) host.innerHTML = "";
        return;
      }

      if (this._previewTimer) clearTimeout(this._previewTimer);
      this._previewTimer = setTimeout(async () => {
        try {
          host.innerHTML = '<div class="flex items-center justify-center min-h-[220px] text-sm text-slate-400">Generating live print preview…</div>';

          const layout = this.layout();
          const previewCount = Math.max(1, Math.min(layout.perPage, this.previewCardCount()));
          if (!this.state.rows.length) {
            this.renderTemplatePreview();
            const status = document.getElementById("studentBatchPreviewStatus");
            if (status) status.textContent = "Template preview • import Excel data to populate cards";
            return;
          }

          const copies = Math.max(1, Number(this.state.copies) || 1);
          const previewRows = [];
          for (const rowData of this.state.rows) {
            for (let copy = 0; copy < copies && previewRows.length < previewCount; copy++) {
              previewRows.push(rowData);
            }
            if (previewRows.length >= previewCount) break;
          }

          const builtCards = [];
          for (const rowData of previewRows) {
            const result = await this.buildHtmlCard(rowData);
            builtCards.push(result.body);
          }

          const maxPageWidth = Math.min(900, Math.max(420, host.clientWidth - 24));
          const pageScale = maxPageWidth / layout.sheet.w;
          const pageWidth = Math.round(layout.sheet.w * pageScale);
          const pageHeight = Math.round(layout.sheet.h * pageScale);
          const nativeCardWidth = Math.max(1, Math.round((Number(this.state.cardWidthMm) || 130) * 96 / 25.4));
          const nativeCardHeight = Math.max(1, Math.round((Number(this.state.cardHeightMm) || 60) * 96 / 25.4));

          const page = document.createElement("div");
          page.className = "student-batch-preview-page";
          page.style.cssText = [
            "position:relative","box-sizing:border-box","flex:none",
            "width:" + pageWidth + "px","height:" + pageHeight + "px",
            "margin:0 auto","background:#fff",
            "border:1px solid #cbd5e1","box-shadow:0 3px 12px rgba(15,23,42,.12)","overflow:hidden"
          ].join(";");

          for (let i = 0; i < builtCards.length; i++) {
            const slot = i;
            const col = slot % layout.cols;
            const row = Math.floor(slot / layout.cols);
            const cellXmm = Number(this.state.margin) + col * (layout.cellW + Number(this.state.gapX));
            const cellYmm = Number(this.state.margin) + row * (layout.cellH + Number(this.state.gapY));
            const xMm = cellXmm + (layout.cellW - layout.card.w) / 2;
            const yMm = cellYmm + (layout.cellH - layout.card.h) / 2;
            const xPx = xMm * pageScale;
            const yPx = yMm * pageScale;
            const cardWidthPx = layout.card.w * pageScale;
            const cardHeightPx = layout.card.h * pageScale;

            const frame = document.createElement("div");
            frame.className = "student-batch-preview-card";
            frame.style.cssText = [
              "position:absolute","left:" + xPx + "px","top:" + yPx + "px",
              "width:" + cardWidthPx + "px","height:" + cardHeightPx + "px",
              "overflow:hidden","box-sizing:border-box","background:#fff"
            ].join(";");

            const cardStage = document.createElement("div");
            cardStage.style.cssText = [
              "position:absolute","left:0","top:0",
              "width:" + nativeCardWidth + "px","height:" + nativeCardHeight + "px",
              "transform-origin:top left",
              "transform:scaleX(" + (cardWidthPx / nativeCardWidth) + ") scaleY(" + (cardHeightPx / nativeCardHeight) + ")",
              "overflow:hidden"
            ].join(";");

            const style = document.createElement("style");
            style.textContent = this.state.htmlStyles;
            cardStage.appendChild(style);

            const clone = builtCards[i].cloneNode(true);
            this.sanitizePlaceholderImages(clone);
            this.proxyExternalPreviewImages(clone);
            cardStage.appendChild(clone);

            frame.appendChild(cardStage);
            page.appendChild(frame);
          }

          host.innerHTML = "";
          host.style.display = "flex";
          host.style.flexDirection = "column";
          host.style.alignItems = "stretch";
          host.style.justifyContent = "flex-start";
          host.appendChild(page);

          const status = document.getElementById("studentBatchPreviewStatus");
          if (status) status.textContent = "Live print preview • " + previewRows.length +
            " Excel record" + (previewRows.length === 1 ? "" : "s") + " • " +
            layout.cols + " × " + layout.rows + " • " + this.state.orientation;
        } catch (e) {
          console.error("Student batch preview failed", e);
          host.innerHTML =
            '<div class="flex flex-col items-center justify-center min-h-[220px] text-sm text-red-500 text-center p-4">' +
            "<strong>Preview failed</strong><span class=\"mt-1\">" +
            escapeHtml(e.message || "Unable to render the template.") + "</span></div>";
        }
      }, 0);
    },

    previewCardCount() {
      const mode = String(document.querySelector('input[name="studentBatchMode"]:checked')?.value || document.getElementById("studentBatchMode")?.value || "cards").toLowerCase();
      if (mode === "single") return 1;
      if (mode === "filled") {
        const copies = Math.max(1, Number(this.state.copies) || 1);
        return Math.max(1, (this.state.rows.length || 1) * copies);
      }
      return Math.max(1, Number(this.state.cardsPerPage) || 1);
    },

    proxyExternalPreviewImages(root) {
      if (!root) return;

      root.querySelectorAll("img[src]").forEach(img => {
        const src = String(img.getAttribute("src") || "").trim();
        if (!/^https?:\/\//i.test(src)) return;
        if (/^https?:\/\/(?:quranhub1\.github\.io|localhost|127\.0\.0\.1|images\.weserv\.nl)(?::\d+)?\//i.test(src)) return;

        img.setAttribute(
          "src",
          "https://images.weserv.nl/?url=" + encodeURIComponent(src)
        );
        img.removeAttribute("crossorigin");
      });
    },

    renderTemplatePreview() {
      const host = document.getElementById("studentBatchPrintPreview");
      if (!host || this.state.templateMode !== "html") return;
      host.innerHTML = "";
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.state.htmlText, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());
      const source = this.findHtmlCardRoot(doc);
      const wrapper = document.createElement("div");
      wrapper.className = "student-batch-preview-card";
      wrapper.style.width = Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) + "px";
      wrapper.style.height = (Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) * this.state.cardHeightMm / this.state.cardWidthMm) + "px";
      const style = document.createElement("style");
      style.textContent = this.state.htmlStyles;
      wrapper.appendChild(style);

      const body = source.cloneNode(true);
      this.sanitizePlaceholderImages(body);
      this.proxyExternalPreviewImages(body);
      body.style.margin = "0";
      body.style.boxSizing = "border-box";
      wrapper.appendChild(body);
      host.appendChild(wrapper);
    },

    refresh() {
      const fileEl = document.getElementById("studentBatchTemplateName");
      const excelEl = document.getElementById("studentBatchExcelName");
      const countEl = document.getElementById("studentBatchCount");
      const layoutEl = document.getElementById("studentBatchLayout");
      const fieldsEl = document.getElementById("studentBatchFields");
      const sizeEl = document.getElementById("studentBatchCardSize");
      const photoEl = document.getElementById("studentBatchPhotoName");

      if (fileEl) fileEl.textContent = this.state.templateName || "No template selected";
      if (excelEl) excelEl.textContent = this.state.rows.length ? "Excel data loaded" : "No Excel file selected";
      if (countEl) countEl.textContent = String(this.state.rows.length);
      if (photoEl) photoEl.textContent = this.state.photoFiles.size ? "Photo folder indexed" : "No photo folder (optional)";
      if (sizeEl) sizeEl.textContent = (Number(this.state.cardWidthMm).toFixed(1) + " × " + Number(this.state.cardHeightMm).toFixed(1) + " mm");

      const l = this.layout();
      if (layoutEl) layoutEl.textContent = l.cols + " × " + l.rows + " = " + l.perPage + " cards/page • " + this.state.orientation + " • " + this.state.resolution + " DPI";

      if (fieldsEl) this.renderFieldMapping(fieldsEl);

      const missingMappings = this.state.templateFields.filter(field =>
        !this.isBadgeField(field) && !this.isStudentPhotoField(field) && !this.state.mapping[field]
      );
      const batchReady =
        !!this.state.rows.length &&
        !!this.state.templateFile &&
        !!this.state.templateFields.length &&
        !missingMappings.length;

      const generate = document.getElementById("studentBatchGenerate");
      if (generate) {
        generate.disabled = !batchReady;
        generate.title = missingMappings.length
          ? "Map every non-image template data field to an Excel column before generating."
          : "";
      }

      const print = document.getElementById("studentBatchPrint");
      if (print) {
        print.disabled = !batchReady;
        print.title = missingMappings.length
          ? "Map every non-image template data field to an Excel column before printing."
          : "";
      }

      if (this.state.templateMode === "html") this.previewBatch();
    },

    async print() {
      if (!this.state.rows.length || !this.state.templateFile || !this.state.templateFields.length) {
        this.notify("Select an HTML template and Excel data first.", "error");
        return;
      }

      const missing = this.state.templateFields.filter(field =>
        !this.isBadgeField(field) && !this.is
