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
      const root = doc.querySelector("[data-card], .student-card, #student-card, .id-card, #id-card, .card");
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
      this.renderTemplatePreview();
      this.refresh();
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
      const classMatch = css.match(/(?:\.student-card|\.card|\#student-card|\#card)[^{]*\{([^}]*)\}/i);
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

    async loadExcel(file) {
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("The workbook has no worksheets.");
        const worksheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
          dateNF: "yyyy-mm-dd",
          defval: "",
          blankrows: false
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

        const dataMatrix = matrix.slice(headerIndex + 1).filter(row => {
          const cells = nonEmpty(row);
          return cells.length > 0;
        });

        const rows = dataMatrix.map(row => {
          const obj = {};
          headers.forEach((header, i) => {
            obj[header] = row[i] ?? "";
          });
          return obj;
        }).filter(row => Object.values(row).some(v => String(v ?? "").trim() !== ""));

        if (!rows.length) {
          // Do not reject a workbook merely because the first selected sheet
          // has headers without records. Give a precise message and keep the
          // importer ready for another sheet.
          throw new Error("The selected worksheet has headers but no student records. Choose the sheet containing the student table.");
        }

        this.state.rows = rows;
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

    async resolvePhoto(value) {
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

      return html.replace(/{{\s*([^{}]+?)\s*}}/g, (_m, name) => {
        const field = String(name).trim();
        return escapeHtml(this.displayValue(row, field));
      });
    },

    async buildHtmlCard(row) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.state.htmlText, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());

      const body = doc.querySelector("[data-card], .student-card, #student-card, .id-card, #id-card, .card") || doc.body;
      const html = this.replacePlaceholders(body.innerHTML, row);
      body.innerHTML = html;

      const all = body.querySelectorAll("*");
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
            const photo = await this.resolvePhoto(value);
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
            const photo = await this.resolvePhoto(value);
            if (photo) el.setAttribute("src", photo);
            else el.setAttribute("alt", ".....");
          } else el.textContent = this.displayValue(row, bind);
        }

        const srcBind = el.getAttribute("data-bind-src");
        if (srcBind && el.tagName === "IMG") {
          const photo = await this.resolvePhoto(this.resolveValue(row, srcBind));
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
      while (body.firstChild) wrapper.appendChild(body.firstChild);
      document.body.appendChild(wrapper);

      const canvas = await this.domToCanvas(wrapper, this.state.cardWidthMm, this.state.cardHeightMm);
      wrapper.remove();
      return canvas;
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

      // Fit the requested number by trying every reasonable grid. If the
      // native card size cannot fit, scale the cards down uniformly rather
      // than silently changing the requested number.
      let best = null;
      for (let cols = 1; cols <= requested; cols++) {
        const rows = Math.ceil(requested / cols);
        const availableW = sheet.w - margin * 2 - Math.max(0, cols - 1) * gx;
        const availableH = sheet.h - margin * 2 - Math.max(0, rows - 1) * gy;
        if (availableW <= 0 || availableH <= 0) continue;
        const scale = Math.min(1, availableW / (cols * baseCard.w), availableH / (rows * baseCard.h));
        if (!best || scale > best.scale || (scale === best.scale && Math.abs(cols - rows) < Math.abs(best.cols - best.rows))) {
          best = { cols, rows, scale };
        }
      }
      if (!best) best = { cols: 1, rows: 1, scale: 1 };

      const card = { w: baseCard.w * best.scale, h: baseCard.h * best.scale };
      this.state.columns = best.cols;
      this.state.rowsPerPage = best.rows;
      return { card, sheet, cols: best.cols, rows: best.rows, perPage: requested, scale: best.scale };
    },

    renderTemplatePreview() {
      const host = document.getElementById("studentBatchPreview");
      if (!host || this.state.templateMode !== "html") return;
      host.innerHTML = "";
      const parser = new DOMParser();
      const doc = parser.parseFromString(this.state.htmlText, "text/html");
      doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());
      const source = doc.querySelector("[data-card], .student-card, #student-card, .id-card, #id-card, .card") || doc.body;
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
            const x = Number(this.state.margin) + col * (layout.card.w + Number(this.state.gapX));
            const y = Number(this.state.margin) + row * (layout.card.h + Number(this.state.gapY));
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
      const host = document.getElementById("studentBatchPreview");
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
  });
})();