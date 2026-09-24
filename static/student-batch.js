/* Joes Studio Student Batch Generator
 * HTML-first template workflow with automatic Excel placeholder matching.
 * Local-first: template, spreadsheet and optional photos are selected by the user.
 */
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
      cardWidthMm: 85.6,
      cardHeightMm: 54,
      orientation: "portrait",
      cardsPerPage: 6,
      resolution: 300,
      embeddedPhotos: new Map(),
    },

    normalize(value) {
      return String(value ?? "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[\s_\-.()/\\]+/g, "")
        .replace(/[^a-z0-9]/g, "");
    },

    aliases: {
      name: ["name", "studentname", "fullname", "studentfullname", "student"],
      studentname: ["studentname", "name", "fullname", "studentfullname", "student"],
      firstname: ["firstname", "givenname", "forename"],
      lastname: ["lastname", "surname", "familyname"],
      othernames: ["othernames", "middlename", "middle"],
      regno: ["regno", "registrationno", "registrationnumber", "registrationid", "admissionno", "studentno", "studentnumber", "id"],
      registrationnumber: ["registrationnumber", "registrationno", "regno", "registrationid", "admissionno"],
      registrationno: ["registrationno", "registrationnumber", "regno", "admissionno"],
      class: ["class", "classroom", "form", "grade", "level"],
      stream: ["stream", "classstream"],
      gender: ["gender", "sex", "biologicalsex"],
      sex: ["sex", "gender", "biologicalsex"],
      sitting: ["sitting", "exam", "examination", "examname", "examinationname", "session", "examinationsession"],
      issuedby: ["issuedby", "issued", "issuedbyoffice", "issuingoffice", "issuer", "issuedbykshs"],
      dob: ["dob", "dateofbirth", "birthdate", "birthday"],
      photo: ["photo", "photofile", "photofilename", "photoimage", "image", "imagefile", "picture", "studentphoto", "studentimage"],
      barcode: ["barcode", "barcodeno", "barcodevalue"],
      qr: ["qr", "qrcode", "qrvalue", "qrcodevalue"],
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
          await App.io.loadProjectData(data);
          this.state.cardWidthMm = this.getPaperWidthMm();
          this.state.cardHeightMm = this.getPaperHeightMm();
          this.state.mapping = this.autoMapPaper();
          this.refresh();
          Utils.toast("Paper template loaded: " + file.name);
        }
      } catch (e) {
        console.error(e);
        this.state.templateFile = null;
        Utils.toast("Template could not be loaded: " + e.message, "error");
      }
    },

    async loadHtmlTemplate(text) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());

      const styles = Array.from(doc.querySelectorAll("style")).map(s => s.textContent || "").join("\n");
      // Prefer the actual card container when the template contains a full
      // HTML document. This prevents headers, school branding, instructions,
      // and other page-level content from becoming the generated "card".
      const root = doc.querySelector("[data-card], .exam-card, .student-card, #student-card, .id-card, #id-card, .card");
      const cardRoot = root || doc.body;
      if (!cardRoot || !cardRoot.innerHTML.trim()) throw new Error("The HTML template is empty.");

      const fields = this.detectPlaceholders(text);
      if (!fields.length) {
        throw new Error("No {{placeholders}} were found in the HTML template.");
      }

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
      Utils.toast("HTML template loaded: " + fileNameSafe(this.state.templateName) + " • " + fields.length + " placeholders detected");
    },

    detectPlaceholders(text) {
      const found = [];
      const seen = new Set();
      const add = value => {
        const field = String(value || "").trim();
        if (!field) return;
        const key = this.normalize(field);
        if (key && !seen.has(key)) {
          seen.add(key);
          found.push(field);
        }
      };

      // Primary syntax: {{Student Name}}
      const mustache = /{{\s*([^{}]+?)\s*}}/g;
      let m;
      while ((m = mustache.exec(text))) add(m[1]);

      // Also accept HTML data bindings, so templates do not have to put
      // placeholders visibly inside the card text.
      try {
        const doc = new DOMParser().parseFromString(text, "text/html");
        doc.querySelectorAll("[data-bind],[data-field],[data-bind-src],[data-bind-qr],[data-bind-barcode]").forEach(el => {
          ["data-bind", "data-field", "data-bind-src", "data-bind-qr", "data-bind-barcode"].forEach(attr => {
            const value = el.getAttribute(attr);
            if (value) add(value.replace(/^{{\\s*|\\s*}}$/g, ""));
          });
        });
      } catch (_) {}

      // Recognize arbitrary semantic field IDs. The final template may use any
      // field name, so do not maintain a fixed KSHS-only list. Output fields
      // (out-*) are authoritative; editable text inputs (in-*) are accepted
      // when they represent data rather than UI controls.
      try {
        const doc = new DOMParser().parseFromString(text, "text/html");

        doc.querySelectorAll("[id]").forEach(el => {
          const id = String(el.id || "").trim();
          const outMatch = id.match(/^out[-_](.+)$/i);
          if (outMatch) {
            add(outMatch[1].replace(/[-_]+/g, " "));
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
            const isDataInput = ["text", "number", "date", "email", "tel", "search", ""].includes(type);
            const isOutputPaired = !!doc.querySelector("#out-" + inMatch[1] + ", #out_" + inMatch[1]);
            const isControl = /^(?:badge[-_]?(?:file|url)|file|url|button|submit|reset|search)$/i.test(inMatch[1]);
            if (!isControl && (isDataInput || isOutputPaired || tag === "select" || tag === "textarea")) {
              add(name);
            }
          }
        });

        // Explicit data bindings always define fields, including completely
        // custom names such as programme, index number, department, campus,
        // intake, phone, nationality, or any future spreadsheet column.
        doc.querySelectorAll("[data-field],[data-bind],[data-bind-src],[data-bind-qr],[data-bind-barcode]").forEach(el => {
          ["data-field","data-bind","data-bind-src","data-bind-qr","data-bind-barcode"].forEach(attr => {
            const value = el.getAttribute(attr);
            if (value) add(value.replace(/^{{\s*|\s*}}$/g, ""));
          });
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

      return { w: 85.6, h: 54 };
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
      const headers = this.state.headers;
      const n = this.normalize(field);
      if (!n) return null;

      let found = headers.find(h => this.normalize(h) === n);
      if (found) return found;

      const aliases = this.aliases[n] || [n];
      found = headers.find(h => aliases.includes(this.normalize(h)));
      if (found) return found;

      const scored = headers.map(h => {
        const hn = this.normalize(h);
        let score = 0;
        aliases.forEach(a => {
          if (hn === a) score = Math.max(score, 100);
          else if (hn.includes(a) || a.includes(hn)) score = Math.max(score, 65);
        });
        if (n && (hn.includes(n) || n.includes(hn))) score = Math.max(score, 80);
        return { h, score };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
      return scored[0]?.h || null;
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

    autoMapPaper() {
      const map = {};
      const objects = App.canvas?.getObjects?.() || [];
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

        // Resolve the workbook's first worksheet through the OOXML
        // relationships instead of assuming it is always sheet1.xml.
        const workbookPath = "xl/workbook.xml";
        const workbookRelPath = "xl/_rels/workbook.xml.rels";
        const workbookFile = zip.file(workbookPath);
        const workbookRelFile = zip.file(workbookRelPath);
        if (!workbookFile || !workbookRelFile) return result;

        const relationshipMap = async (file, relPath) => {
          const xml = await file.async("text");
          const doc = new DOMParser().parseFromString(xml, "application/xml");
          const map = {};
          Array.from(doc.getElementsByTagNameNS("*", "Relationship")).forEach(rel => {
            const id = rel.getAttribute("Id");
            const target = rel.getAttribute("Target");
            if (id && target) map[id] = this.resolveZipPath(relPath, target);
          });
          return map;
        };

        const workbookRelMap = await relationshipMap(workbookRelFile, workbookRelPath);
        const workbookXml = await workbookFile.async("text");
        const workbookDoc = new DOMParser().parseFromString(workbookXml, "application/xml");
        const sheets = Array.from(workbookDoc.getElementsByTagNameNS("*", "sheet"));
        const firstSheet = sheets[0];
        if (!firstSheet) return result;

        const sheetRelId =
          firstSheet.getAttribute("r:id") ||
          firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
        const sheetPath = workbookRelMap[sheetRelId];
        if (!sheetPath) return result;

        const sheetFile = zip.file(sheetPath);
        const relPath = this.zipSiblingRelsPath(sheetPath);
        const relFile = zip.file(relPath);
        if (!sheetFile || !relFile) return result;

        const relMap = await relationshipMap(relFile, relPath);

        const sheetXml = await sheetFile.async("text");
        const sheetDoc = new DOMParser().parseFromString(sheetXml, "application/xml");
        const drawing = Array.from(sheetDoc.getElementsByTagNameNS("*", "drawing"))[0];
        if (!drawing) return result;

        const drawingRelId =
          drawing.getAttribute("r:id") ||
          drawing.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
        const drawingPath = relMap[drawingRelId];
        if (!drawingPath) return result;

        const drawingFile = zip.file(drawingPath);
        const drawingRelPath = this.zipSiblingRelsPath(drawingPath);
        const drawingRelFile = zip.file(drawingRelPath);
        if (!drawingFile || !drawingRelFile) return result;

        const imageMap = await relationshipMap(drawingRelFile, drawingRelPath);

        const drawingXml = await drawingFile.async("text");
        const drawingDoc = new DOMParser().parseFromString(drawingXml, "application/xml");
        const anchorNames = new Set(["twoCellAnchor", "oneCellAnchor", "absoluteAnchor"]);
        const anchors = Array.from(drawingDoc.getElementsByTagNameNS("*", "*"))
          .filter(node => anchorNames.has(node.localName));

        for (const anchor of anchors) {
          const from = Array.from(anchor.getElementsByTagNameNS("*", "from"))[0];
          const blip = Array.from(anchor.getElementsByTagNameNS("*", "blip"))[0];
          if (!from || !blip) continue;

          const rowNode = Array.from(from.getElementsByTagNameNS("*", "row"))[0];
          const relId =
            blip.getAttribute("r:embed") ||
            blip.getAttribute("embed") ||
            blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
          const row = Number(rowNode?.textContent);
          const imagePath = imageMap[relId];
          if (!Number.isFinite(row) || !imagePath) continue;

          const imageFile = zip.file(imagePath.replace(/^\//, ""));
          if (!imageFile) continue;

          const blob = await imageFile.async("blob");
          const dataUrl = await this.fileToDataUrl(blob);
          if (dataUrl && !result.has(row)) result.set(row, dataUrl);
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

      // In an OOXML .rels file, relationship targets are resolved relative
      // to the owning part's directory, not the _rels directory itself.
      // Example: xl/worksheets/_rels/sheet1.xml.rels + ../drawings/drawing1.xml
      // resolves to xl/drawings/drawing1.xml.
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
        // SheetJS reads cell values, but Excel-embedded photos live in the
        // workbook ZIP drawing/media parts rather than cell values. Extract
        // those photos separately and associate them with their anchored row.
        this.state.embeddedPhotos = await this.extractEmbeddedExcelImages(buffer);
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("The workbook has no worksheets.");
        const worksheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          dateNF: "yyyy-mm-dd",
          defval: "",
          // Keep blank worksheet rows so embedded-image anchor row numbers
          // continue to correspond to the actual Excel row positions.
          blankrows: true
        });

        // Real-world school workbooks may contain titles, merged headings,
        // logos, blank spacer rows, or instructions before the actual table.
        // Find a row that behaves like a header AND has real records beneath it.
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
        let bestDataRows = [];

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
            // A record should contain actual values, not just another heading.
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

          // Strongly favor rows followed by records. This prevents a workbook
          // title such as "STUDENT EXAMINATION CARDS" from being mistaken for
          // the header simply because it contains the word student.
          let score = dataEvidence * 100 + keyword * 20 + Math.min(width, 50) + unique;
          score += hasEnoughColumns ? 25 : -20;
          score += Math.round(density * 20);

          if (score > bestScore) {
            bestScore = score;
            headerIndex = i;
            bestDataRows = [];
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

        // Preserve each record's original zero-based worksheet row while
        // dropping blank spacer rows from the final student list. This keeps
        // Excel drawing anchors aligned with the correct student.
        const dataRecords = matrix
          .slice(headerIndex + 1)
          .map((row, offset) => ({
            row,
            worksheetRowIndex: headerIndex + 1 + offset
          }))
          .filter(item => nonEmpty(item.row).length > 0);

        const rows = dataRecords.map(item => {
          const obj = {};
          headers.forEach((header, i) => {
            obj[header] = item.row[i] ?? "";
          });
          Object.defineProperty(obj, "__worksheetRowIndex", {
            value: item.worksheetRowIndex,
            enumerable: false,
            configurable: true
          });
          return obj;
        }).filter(row => Object.values(row).some(v => String(v ?? "").trim() !== ""));

        if (!rows.length) {
          // Do not reject a workbook merely because the first selected sheet
          // has headers without records. Give a precise message and keep the
          // importer ready for another sheet.
          throw new Error("The selected worksheet has headers but no student records. Choose the sheet containing the student table.");
        }

        this.state.rows = rows.map(row => {
          const copy = { ...row };
          const embedded = this.state.embeddedPhotos.get(row.__worksheetRowIndex);
          if (embedded) copy.__embeddedPhoto = embedded;
          return copy;
        });
        this.state.headers = headers;
        if (this.state.templateMode === "html") this.state.mapping = this.autoMapHtml();
        else if (this.state.templateMode === "paper") this.state.mapping = this.autoMapPaper();
        this.refresh();
        Utils.toast(rows.length + " student records loaded • " + Object.keys(this.state.mapping).length + " fields matched");
      } catch (e) {
        console.error(e);
        Utils.toast("Excel import failed: " + e.message, "error");
      }
    },

    async loadPhotos(files) {
      this.state.photoFiles.clear();
      for (const file of Array.from(files || [])) {
        this.state.photoFiles.set(file.name.toLowerCase(), file);
        this.state.photoFiles.set(file.name.replace(/\.[^.]+$/, "").toLowerCase(), file);
      }
      this.refresh();
      Utils.toast(Math.floor(this.state.photoFiles.size / 2) + " photo files indexed • Excel photo fields will be matched automatically");
    },

    resolveValue(row, field) {
      const header = this.state.mapping[field];
      if (header && row[header] !== undefined) return row[header];
      if (row[field] !== undefined) return row[field];
      const h = this.findHeader(field);
      return h && row[h] !== undefined ? row[h] : "";
    },

    displayValue(row, field) {
      const value = this.resolveValue(row, field);
      // A template field may intentionally have no Excel column. Keep the
      // field visible in the printed card and leave a manual-fill marker.
      return String(value ?? "").trim() === "" ? "....." : value;
    },

    async fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    async resolvePhoto(value, row) {
      // Embedded Excel photos are attached to the worksheet row, not stored
      // as a normal cell value. Prefer the extracted row image when present.
      if (row?.__embeddedPhoto) return row.__embeddedPhoto;
      if (!value) return "";
      const raw = String(value).trim();
      if (/^(data:|blob:|https?:)/i.test(raw)) return raw;

      const clean = raw.split(/[\\/]/).pop().trim().toLowerCase();
      const stem = clean.replace(/\.[^.]+$/, "");
      const candidates = [
        clean, stem,
        stem.replace(/\s+/g, ""),
        stem.replace(/[^a-z0-9]/gi, ""),
      ];

      let file = null;
      for (const key of candidates) {
        file = this.state.photoFiles.get(key);
        if (file) break;
      }

      // Final fallback: compare normalized filename stems. This handles Excel
      // values such as "STU-001", "stu_001.jpg", or "photos/stu 001.png".
      if (!file) {
        const target = this.normalize(stem);
        for (const [key, candidate] of this.state.photoFiles.entries()) {
          if (this.normalize(key.replace(/\.[^.]+$/, "")) === target) {
            file = candidate;
            break;
          }
        }
      }

      return file ? await this.fileToDataUrl(file) : "";
    },

    replacePlaceholders(html, row) {
      const values = {};
      for (const field of this.state.templateFields) values[field] = this.resolveValue(row, field);

      const rendered = html.replace(/{{\s*([^{}]+?)\s*}}/g, (_m, name) => {
        const field = String(name).trim();
        return escapeHtml(this.displayValue(row, field));
      });

      // The supplied master card has no fill-in underline characters.
      // Remove decorative runs left beside placeholders without touching
      // ordinary student data.
      return rendered
        .replace(/[ \t]*_{4,}[ \t]*/g, " ")
        .replace(/[ \t]*[─━]{4,}[ \t]*/g, " ");
    },

    async buildHtmlCard(row) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.state.htmlText, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());

      const body = doc.querySelector("[data-card], .exam-card, .student-card, #student-card, .id-card, #id-card, .card") || doc.body;
      const html = this.replacePlaceholders(body.innerHTML, row);
      body.innerHTML = html;

      // The master card supplied for this workflow uses the legacy
      // "dots-underline" class on its data fields. The requested batch card
      // must not show those horizontal fill-in lines, so remove the class
      // itself rather than trying to out-prioritize its CSS with more CSS.
      body.querySelectorAll(".dots-underline").forEach(el => el.classList.remove("dots-underline"));

      // The supplied master card does not use fill-in lines beneath
      // student values. Remove line styling from bound fields and their
      // immediate row containers, while preserving the card/photo borders.
      const fieldLineNodes = new Set();
      const fieldSelector = '[id^="out-"], [id^="out_"], [id^="field-"], [id^="field_"], [id^="data-"], [id^="data_"], [data-bind], [data-field], [data-bind-src]';
      body.querySelectorAll(fieldSelector).forEach(el => {
        if (el.tagName === "IMG") return;
        fieldLineNodes.add(el);

        let parent = el.parentElement;
        let depth = 0;
        while (parent && parent !== body && depth < 2) {
          if (!parent.querySelector("img")) fieldLineNodes.add(parent);
          parent = parent.parentElement;
          depth++;
        }
      });

      fieldLineNodes.forEach(el => {
        el.style.setProperty("border-bottom", "none", "important");
        el.style.setProperty("text-decoration", "none", "important");
        el.style.setProperty("box-shadow", "none", "important");
      });

      const cleanupStyle = document.createElement("style");
      cleanupStyle.textContent = [
        fieldSelector + "::before",
        fieldSelector + "::after"
      ].join(",") + "{content:none !important;border:0 !important;box-shadow:none !important;text-decoration:none !important;}";
      body.prepend(cleanupStyle);

      const all = body.querySelectorAll("*");
      // Leave external template images as ordinary browser images in the live
      // preview. Setting crossorigin="anonymous" on the KSHS badge causes the
      // browser to enforce CORS and hide an otherwise displayable image.
      body.querySelectorAll("img[src]").forEach(img => {
        img.removeAttribute("crossorigin");
        img.loading = "eager";
        img.decoding = "sync";
      });

      // Do not replace external template images with a failed fetch in the
      // live preview. Browsers can display the badge directly even when the
      // source does not grant CORS. Keep the real src for preview; the PDF
      // renderer separately inlines images when it rasterizes the card.

      for (const el of all) {
        for (const attr of Array.from(el.attributes)) {
          if (!attr.value.includes("{{")) continue;
          const replaced = this.replacePlaceholders(attr.value, row);
          el.setAttribute(attr.name, replaced);
        }

        // Bind arbitrary semantic IDs such as out-name, out-program,
        // in-index, field-photo, data-address, etc.
        const idMatch = String(el.id || "").match(/^(?:out|in|field|data)[-_](.+)$/i);
        if (idMatch) {
          const field = idMatch[1].replace(/[-_]+/g, " ");
          const value = this.resolveValue(row, field);
          if (el.tagName === "IMG") {
            const photo = await this.resolvePhoto(value, row);
            if (photo) el.setAttribute("src", photo);
            else el.setAttribute("alt", ".....");
          } else if (!/^in[-_]/i.test(el.id)) {
            el.textContent = this.displayValue(row, field);
          }
        }

        const bind = el.getAttribute("data-bind") || el.getAttribute("data-field");
        if (bind) {
          const value = this.resolveValue(row, bind);
          if (el.tagName === "IMG") {
            const photo = await this.resolvePhoto(value, row);
            if (photo) el.setAttribute("src", photo);
            else el.setAttribute("alt", ".....");
          } else el.textContent = this.displayValue(row, bind);
        }

        const srcBind = el.getAttribute("data-bind-src");
        if (srcBind && el.tagName === "IMG") {
          const photo = await this.resolvePhoto(this.resolveValue(row, srcBind), row);
          if (photo) el.setAttribute("src", photo);
          else el.setAttribute("alt", ".....");
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
      // Keep the actual card root. The template stylesheet targets
      // .exam-card (and similar root selectors), so moving only its children
      // strips the selector that controls the badge, fields, borders and
      // internal positioning. That is why only the badge was surviving.
      const cardClone = body.cloneNode(true);
      cardClone.removeAttribute("id");
      cardClone.style.width = this.state.cardWidthMm + "mm";
      cardClone.style.height = this.state.cardHeightMm + "mm";
      cardClone.style.maxWidth = "none";
      cardClone.style.maxHeight = "none";
      cardClone.style.margin = "0";
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

        // Do not fetch cross-origin images directly from the GitHub Pages
        // origin. KSHS does not expose the required CORS header, so direct
        // fetches fail before the exporter can rasterize the image.
        let fetchSrc = src;
        try {
          const parsed = new URL(src, window.location.href);
          if (parsed.origin !== window.location.origin) {
            fetchSrc = "https://images.weserv.nl/?url=" + encodeURIComponent(parsed.href);
          }
        } catch (_) {}

        try {
          const response = await fetch(fetchSrc, {
            mode: "cors",
            credentials: "omit",
            cache: "force-cache"
          });
          if (!response.ok) throw new Error("HTTP " + response.status);

          const blob = await response.blob();
          const dataUrl = await this.fileToDataUrl(blob);
          if (dataUrl) {
            img.setAttribute("src", dataUrl);
            return;
          }
          throw new Error("Empty image response");
        } catch (error) {
          // Keep the original source as a last-resort browser rendering path.
          // Never replace the actual image with a fake placeholder.
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
      clone.style.position = "static";
      clone.style.left = "0";
      clone.style.top = "0";
      clone.style.width = width + "px";
      clone.style.height = height + "px";

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
      const paper = App.state.currentPaper || {};
      return Number(paper.w) / 3.7795275591;
    },

    getPaperHeightMm() {
      const paper = App.state.currentPaper || {};
      return Number(paper.h) / 3.7795275591;
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
      const baseCard = { w: Number(this.state.cardWidthMm) || 85.6, h: Number(this.state.cardHeightMm) || 54 };
      const sheet = this.getSheetSize();
      const margin = Number(this.state.margin) || 0;
      const gx = Number(this.state.gapX) || 0;
      const gy = Number(this.state.gapY) || 0;
      const requested = Math.max(1, Number(this.state.cardsPerPage) || 1);

      // Keep the real card aspect ratio. Cards are enlarged uniformly until
      // they fill the available grid as much as physically possible. This
      // avoids the previous two bad extremes: cards stranded in one corner
      // and cards stretched independently in X/Y.
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
          const previewRows = this.state.rows.length
            ? this.state.rows.slice(0, previewCount)
            : Array.from({ length: previewCount }, () => this.samplePreviewRow());

          // The preview is a real print sheet. Each preview card is built from
          // its corresponding Excel row, using exactly the same HTML renderer
          // that the PDF generator uses. No placeholder data is repeated across
          // every card when Excel records are available.
          const builtCards = [];
          for (const rowData of previewRows) {
            const result = await this.buildHtmlCard(rowData);
            builtCards.push(result.body);
          }

          const maxPageWidth = Math.min(900, Math.max(420, host.clientWidth - 24));
          const pageScale = maxPageWidth / layout.sheet.w;
          const pageWidth = Math.round(layout.sheet.w * pageScale);
          const pageHeight = Math.round(layout.sheet.h * pageScale);
          const nativeCardWidth = Math.max(1, Math.round((Number(this.state.cardWidthMm) || 85.6) * 96 / 25.4));
          const nativeCardHeight = Math.max(1, Math.round((Number(this.state.cardHeightMm) || 54) * 96 / 25.4));

          const page = document.createElement("div");
          page.className = "student-batch-preview-page";
          page.style.cssText = [
            "position:relative",
            "box-sizing:border-box",
            "flex:none",
            "width:" + pageWidth + "px",
            "height:" + pageHeight + "px",
            "margin:0 auto",
            "background:#fff",
            "border:1px solid #cbd5e1",
            "box-shadow:0 3px 12px rgba(15,23,42,.12)",
            "overflow:hidden"
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
              "position:absolute",
              "left:" + xPx + "px",
              "top:" + yPx + "px",
              "width:" + cardWidthPx + "px",
              "height:" + cardHeightPx + "px",
              "overflow:hidden",
              "box-sizing:border-box",
              "background:#fff"
            ].join(";");

            const cardStage = document.createElement("div");
            cardStage.style.cssText = [
              "position:absolute",
              "left:0",
              "top:0",
              "width:" + nativeCardWidth + "px",
              "height:" + nativeCardHeight + "px",
              "transform-origin:top left",
              "transform:scaleX(" + (cardWidthPx / nativeCardWidth) + ") scaleY(" + (cardHeightPx / nativeCardHeight) + ")",
              "overflow:hidden"
            ].join(";");

            const style = document.createElement("style");
            style.textContent = this.state.htmlStyles;
            cardStage.appendChild(style);

            const clone = builtCards[i].cloneNode(true);
            clone.removeAttribute("id");
            clone.style.width = nativeCardWidth + "px";
            clone.style.height = nativeCardHeight + "px";
            clone.style.minWidth = nativeCardWidth + "px";
            clone.style.minHeight = nativeCardHeight + "px";
            clone.style.maxWidth = nativeCardWidth + "px";
            clone.style.maxHeight = nativeCardHeight + "px";
            clone.style.maxWidth = "none";
            clone.style.maxHeight = "none";
            clone.style.margin = "0";
            clone.style.position = "relative";
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

          const info = document.createElement("div");
          info.className = "text-xs text-slate-500 text-center mt-2";
          info.textContent =
            "Live print preview • " + previewRows.length + " card" +
            (previewRows.length === 1 ? "" : "s") + " • Excel data integrated • " +
            this.state.orientation + " • " + this.state.sheetSize +
            " • " + layout.cols + " × " + layout.rows + " layout";
          host.appendChild(info);

          const status = document.getElementById("studentBatchPreviewStatus");
          if (status) {
            status.textContent =
              "Live print preview • " + previewRows.length +
              " Excel record" + (previewRows.length === 1 ? "" : "s") +
              " • " + layout.cols + " × " + layout.rows +
              " • " + this.state.orientation;
          }
        } catch (e) {
          console.error("Student batch preview failed", e);
          host.innerHTML =
            '<div class="flex flex-col items-center justify-center min-h-[220px] text-sm text-red-500 text-center p-4">' +
            "<strong>Preview failed</strong><span class=\"mt-1\">" +
            escapeHtml(e.message || "Unable to render the template.") +
            "</span></div>";
        }
      }, 0);
    },

    samplePreviewRow() {
      const sample = {};
      const defaults = {
        name:"Kampala School Student",studentname:"Kampala School Student",firstname:"Kampala",lastname:"Student",
        othernames:"Sample",regno:"KSHS/2026/0001",registrationno:"KSHS/2026/0001",
        registrationnumber:"KSHS/2026/0001",sex:"FEMALE",gender:"FEMALE",
        sitting:"END OF SEMESTER EXAMINATION",exam:"END OF SEMESTER EXAMINATION",
        course:"Certificate in Biomedical Engineering",programme:"Certificate in Biomedical Engineering",
        issuedby:"Examinations Office",photo:""
      };
      this.state.templateFields.forEach(field => { const n=this.normalize(field); sample[field]=defaults[n] ?? ""; });
      return sample;
    },

    previewCardCount() {
      const mode = String(document.querySelector('input[name="studentBatchMode"]:checked')?.value || document.getElementById("studentBatchMode")?.value || "cards").toLowerCase();
      if (mode === "single") return 1;
      if (mode === "filled") return Math.max(1, this.state.rows.length || 1);
      return Math.max(1, Number(this.state.cardsPerPage) || 1);
    },

    renderTemplatePreview() {
      const host = document.getElementById("studentBatchPrintPreview");
      if (!host || this.state.templateMode !== "html") return;
      host.innerHTML = "";
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.state.htmlText, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());
      const source = doc.querySelector("[data-card], .exam-card, .student-card, #student-card, .id-card, #id-card, .card") || doc.body;
      const wrapper = document.createElement("div");
      wrapper.className = "student-batch-preview-card";
      wrapper.style.width = Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) + "px";
      wrapper.style.height = (Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) * this.state.cardHeightMm / this.state.cardWidthMm) + "px";
      const style = document.createElement("style");
      style.textContent = this.state.htmlStyles;
      wrapper.appendChild(style);
      const body = source.cloneNode(true);
      while (body.firstChild) wrapper.appendChild(body.firstChild);
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

      if (fieldsEl) {
        if (!this.state.templateFields.length) {
          fieldsEl.innerHTML = '<span class="text-slate-400">Load an HTML template to detect {{placeholders}}.</span>';
        } else {
          fieldsEl.innerHTML = this.state.templateFields.map(field => {
            const header = this.state.mapping[field];
            return '<div class="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0">' +
              '<span class="font-mono text-[11px] text-slate-700 truncate">{{' + escapeHtml(field) + '}}</span>' +
              (header
                ? '<span class="text-[11px] text-green-700 font-semibold truncate">✓ ' + escapeHtml(header) + '</span>'
                : '<span class="text-[11px] text-orange-600 font-semibold">⚠ not found</span>') +
              '</div>';
          }).join("");
        }
      }

      const generate = document.getElementById("studentBatchGenerate");
      if (generate) generate.disabled = !this.state.rows.length || !this.state.templateFile || !this.state.templateFields.length;
      if (this.state.templateMode === "html") this.previewBatch();
    },

    async generate() {
      if (!this.state.rows.length || !this.state.templateFile) {
        Utils.toast("Select an HTML template and Excel data first.", "error");
        return;
      }

      const missing = this.state.templateFields.filter(f => !this.state.mapping[f]);

      // Excel may contain many more columns than the card uses. Conversely,
      // the template may contain fields that are not represented in Excel.
      // Neither situation blocks generation. Unmatched template fields are
      // printed with "....." so the card can be completed manually.
      if (missing.length) {
        Utils.toast("Generated with " + missing.length + " manual-fill field(s): " + missing.join(", "));
      }

      const layout = this.layout();
      const copies = Math.max(1, Number(this.state.copies) || 1);
      const totalCards = this.state.rows.length * copies;
      const totalPages = Math.ceil(totalCards / layout.perPage);
      const pdf = new window.jspdf.jsPDF({
        orientation: layout.sheet.w > layout.sheet.h ? "l" : "p",
        unit: "mm",
        format: [layout.sheet.w, layout.sheet.h],
        compress: true,
      });

      const originalIndex = App.state.currentDataIndex || 0;
      const originalSheet = App.state.dataSource.currentSheet;
      const originalOnly = App.state.printCurrentOnly;
      const oldData = App.state.dataSource.data;
      const oldHeaders = App.state.dataSource.headers;
      const oldActive = App.state.dataSource.isActive;

      try {
        App.ui.showLoading("Preparing HTML batch...");
        let cardNumber = 0;

        for (let rowIndex = 0; rowIndex < this.state.rows.length; rowIndex++) {
          for (let copy = 0; copy < copies; copy++) {
            const canvas = this.state.templateMode === "html"
              ? await this.renderHtmlCard(this.state.rows[rowIndex])
              : await this.renderPaperCard(rowIndex);

            if (cardNumber > 0 && cardNumber % layout.perPage === 0) {
              pdf.addPage([layout.sheet.w, layout.sheet.h], layout.sheet.w > layout.sheet.h ? "l" : "p");
            }

            const slot = cardNumber % layout.perPage;
            const col = slot % layout.cols;
            const row = Math.floor(slot / layout.cols);
            const cellX = Number(this.state.margin) + col * (layout.cellW + Number(this.state.gapX));
            const cellY = Number(this.state.margin) + row * (layout.cellH + Number(this.state.gapY));
            const x = cellX + (layout.cellW - layout.card.w) / 2;
            const y = cellY + (layout.cellH - layout.card.h) / 2;
            const image = canvas.toDataURL("image/png", 1);
            pdf.addImage(image, "PNG", x, y, layout.card.w, layout.card.h, undefined, "FAST");
            cardNumber++;
            if (cardNumber === 1 || cardNumber % Math.max(1, Math.floor(totalCards / 20)) === 0 || cardNumber === totalCards) {
              App.ui.showLoading("Generating card " + cardNumber + " of " + totalCards + "...");
            }
          }
        }

        const safeName = (this.state.templateName || "student_cards")
          .replace(/\.(html?|paper)$/i, "")
          .replace(/[^a-z0-9_-]+/gi, "_");
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
        if (this.state.templateMode === "paper") await App.dataSource.renderPage(originalIndex);
        App.ui.hideLoading();
      }
    },

    async renderPaperCard(studentIndex) {
      const oldData = App.state.dataSource.data;
      const oldHeaders = App.state.dataSource.headers;
      const oldActive = App.state.dataSource.isActive;
      App.state.dataSource.data = this.state.rows;
      App.state.dataSource.headers = this.state.headers;
      App.state.dataSource.isActive = true;
      App.state.dataSource.currentSheet = "Batch";
      await App.dataSource.renderPage(studentIndex);
      const exportCanvas = await App.io._getExportCanvas();
      exportCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      const image = document.createElement("canvas");
      image.width = exportCanvas.getWidth() * 2;
      image.height = exportCanvas.getHeight() * 2;
      image.getContext("2d").drawImage(exportCanvas.lowerCanvasEl, 0, 0, image.width, image.height);
      exportCanvas.dispose();
      App.state.dataSource.data = oldData;
      App.state.dataSource.headers = oldHeaders;
      App.state.dataSource.isActive = oldActive;
      return image;
    },

    cleanupPreview() {
      const host = document.getElementById("studentBatchPrintPreview");
      if (host) host.innerHTML = "";
    },
  };

  function columnName(index) {
    let n = Number(index) + 1;
    let out = "";
    while (n > 0) {
      const r = (n - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      n = Math.floor((n - 1) / 26);
    }
    return out;
  }

  function fileNameSafe(name) {
    return String(name || "").replace(/[^a-z0-9_.-]+/gi, "_");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  window.JoesStudentBatch = Batch;
  window.addEventListener("load", () => {
    document.getElementById("studentBatchTemplateInput")?.addEventListener("change", e => Batch.loadTemplate(e.target.files[0]));
    document.getElementById("studentBatchExcelInput")?.addEventListener("change", e => Batch.loadExcel(e.target.files[0]));
    document.getElementById("studentBatchPhotoInput")?.addEventListener("change", e => Batch.loadPhotos(e.target.files));
    document.getElementById("studentBatchOrientation")?.addEventListener("change", e => { Batch.state.orientation = e.target.value; Batch.refresh(); });
    document.getElementById("studentBatchCardsPerPage")?.addEventListener("input", e => { Batch.state.cardsPerPage = Math.max(1, Number(e.target.value) || 1); Batch.refresh(); });
    document.getElementById("studentBatchResolution")?.addEventListener("change", e => { Batch.state.resolution = Number(e.target.value) || 300; Batch.refresh(); });
    ["studentBatchSheetSize", "studentBatchMargin", "studentBatchGapX", "studentBatchGapY", "studentBatchCopies"].forEach(id => {
      document.getElementById(id)?.addEventListener("input", () => {
        const keyMap = {
          studentBatchMargin: "margin",
          studentBatchGapX: "gapX",
          studentBatchGapY: "gapY",
          studentBatchCopies: "copies"
        };
        if (id === "studentBatchSheetSize") Batch.state.sheetSize = document.getElementById(id).value;
        else if (keyMap[id]) Batch.state[keyMap[id]] = Number(document.getElementById(id).value);
        Batch.refresh();
      });
    });
    Batch.refresh();
    Batch.previewBatch();
  });
})();