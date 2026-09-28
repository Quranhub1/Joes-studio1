/* Joes Studio Student Batch Generator
 * HTML-first template workflow with automatic Excel placeholder matching.
 * Local-first: template, spreadsheet and optional photos are selected by the user.
 */
(function () {
  const Batch = {
    state: {
      templateFile: null,
      templateName: "",
      templateLibraryId: "",
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
      cardBackground: "#ffffff",
      orientation: "landscape",
      cardsPerPage: 6,
      resolution: 300,
      embeddedPhotos: new Map(),
      badgeFile: null,
      badgeDataUrl: "",
      badgeLibraryId: "",
      schoolName: "Kampala School of Health Sciences",
      schoolNameCustomized: false,
      // Student photos are automatically optimized for card printing.
      // This keeps faces readable on paper without altering the original
      // uploaded files.
      photoEnhancement: {
        enabled: true,
        whiteBackground: false,
        strength: "strong",
        manual: {
          brightness: 0,
          exposure: 0,
          shadows: 0,
          highlights: 0,
          contrast: 0,
          saturation: 0,
          temperature: 0,
          sharpness: 0,
          faceLighting: 0,
          cropScale: 100,
          positionX: 0,
          positionY: 0,
          opacity: 100
        }
      },
      enhancedPhotoCache: new Map(),
    },

    notify(msg, type = "info") {
      if (window.Utils?.toast) {
        window.Utils.toast(msg, type);
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

    normalizeCardColor(value) {
      const raw = String(value || "").trim();
      return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : "#ffffff";
    },

    setCardBackground(value) {
      this.state.cardBackground = this.normalizeCardColor(value);
      const color = this.state.cardBackground;

      const colorInput = document.getElementById("studentBatchCardBackground");
      const hexInput = document.getElementById("studentBatchCardBackgroundHex");
      if (colorInput && colorInput.value !== color) colorInput.value = color;
      if (hexInput && hexInput.value.toLowerCase() !== color) hexInput.value = color;

      this.refresh();
    },

    applyCardBackground(root) {
      if (!root) return;
      const color = this.normalizeCardColor(this.state.cardBackground);
      root.style.setProperty("background-color", color, "important");
      root.setAttribute("data-student-batch-background", color);
    },

    getDefaultSchoolName() { return "Kampala School of Health Sciences"; },

    setSchoolName(value, options = {}) {
      const next = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      this.state.schoolName = next || this.getDefaultSchoolName();
      if (options.customized !== false) this.state.schoolNameCustomized = true;
      try { localStorage.setItem("joesStudio.studentBatchSchoolName.v1", this.state.schoolName); } catch (_) {}
      this.refresh();
    },

    restoreSchoolName() {
      try {
        const saved = localStorage.getItem("joesStudio.studentBatchSchoolName.v1");
        if (saved) {
          this.state.schoolName = String(saved).trim().slice(0, 80) || this.getDefaultSchoolName();
          this.state.schoolNameCustomized = this.state.schoolName !== this.getDefaultSchoolName();
        }
      } catch (_) {}
    },

    resetBranding() {
      this.state.schoolName = this.getDefaultSchoolName();
      this.state.schoolNameCustomized = false;
      try { localStorage.removeItem("joesStudio.studentBatchSchoolName.v1"); } catch (_) {}
      this.clearBadge(true);
      this.refresh();
      this.notify("Template branding reset.");
    },

    applyBranding(root) {
      if (!root) return;
      const school = this.state.schoolName || this.getDefaultSchoolName();
      const schoolSelectors = ["[data-school-name]", ".school-name", "#school-name", "#schoolName", ".school", ".school-title", ".institution-name", ".institution"];
      let schoolNode = null;
      for (const selector of schoolSelectors) {
        const candidate = root.querySelector(selector);
        if (candidate) { schoolNode = candidate; break; }
      }
      if (schoolNode) schoolNode.textContent = school;

      let badgeImg = root.querySelector("[data-badge] img,[data-logo] img,.badge-img,.badge-image,.school-badge,.school-logo,.logo-img,#badge,#school-badge,#school-logo");
      if (!badgeImg) badgeImg = Array.from(root.querySelectorAll("img")).find(img => /badge|logo|crest|emblem|seal/i.test(String(img.className || "") + " " + String(img.id || "") + " " + String(img.alt || ""))) || null;

      if (this.state.badgeDataUrl) {
        if (!badgeImg) {
          const mark = root.querySelector(".mark, .card-badge, .badge, .brand-mark");
          if (mark) {
            badgeImg = document.createElement("img");
            badgeImg.className = "student-batch-brand-badge";
            badgeImg.alt = "School badge";
            badgeImg.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;";
            mark.textContent = "";
            mark.appendChild(badgeImg);
          }
        }
        if (badgeImg) {
          badgeImg.setAttribute("src", this.imageSourceForTemplate(this.state.badgeDataUrl));
          badgeImg.style.display = "block";
          badgeImg.style.objectFit = "contain";
        }
      }
    },

    normalize(value) {
      return String(value ?? "")
        .toLowerCase()
        .replace(/&amp;/g, "and")
        .replace(/[\s_\-.()/\\]+/g, "")
        .replace(/[^a-z0-9]/g, "");
    },

    // Always render the exact card element from the selected HTML file.
    // KSHS templates use #exam-card / .card-container, while custom templates
    // may use one of the other supported card selectors.
    findHtmlCardRoot(doc) {
      return doc.querySelector(
        "#exam-card, [data-card], .card-container, .exam-card, .student-card, " +
        "#student-card, .id-card, #id-card, .card"
      ) || doc.body;
    },

    organizeUI() {
      const modal = document.getElementById("studentBatchModal");
      if (!modal || modal.dataset.organized === "true") return;
      const shell = modal.querySelector(":scope > div");
      const grid = shell?.querySelector(":scope > .p-5.grid");
      if (!shell || !grid) return;

      const sections = Array.from(grid.children).filter(el => el.tagName === "SECTION");
      const findSection = needle => sections.find(section =>
        String(section.querySelector("h3")?.textContent || "").toLowerCase().includes(needle)
      );
      const template = findSection("html card template");
      const excel = findSection("student excel data");
      const mapping = findSection("template ↔ excel");
      const photoBrand = sections.find(section => {
        const t = String(section.textContent || "").toLowerCase();
        return t.includes("optional student photos") && t.includes("template badge");
      });
      const print = findSection("print sheet");
      if (!template || !excel || !mapping || !photoBrand || !print) return;

      const style = document.createElement("style");
      style.textContent = [
        "#studentBatchWorkspace{display:block;min-height:0;overflow:visible;padding:0 20px 24px}",
        "#studentBatchTopNav{position:sticky;top:0;z-index:20;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 0;background:#fff;border-bottom:1px solid #e2e8f0;margin-bottom:16px}",
        ".student-batch-step{display:flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#64748b;cursor:pointer;font-size:11px;font-weight:800}",
        ".student-batch-step.active{background:#0f172a;color:#fff;border-color:#0f172a}",
        ".student-batch-step .num{width:23px;height:23px;border-radius:7px;display:grid;place-items:center;background:#f1f5f9;color:#475569}",
        ".student-batch-step.active .num{background:#fff;color:#0f172a}",
        "#studentBatchAllContent{display:grid;gap:16px}",
        ".student-batch-section{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:16px;scroll-margin-top:72px}",
        ".student-batch-section-title{font-size:15px;font-weight:850;color:#1e293b;margin-bottom:12px}",
        ".student-batch-section-sub{font-size:10px;color:#94a3b8;margin-top:-8px;margin-bottom:12px}",
        ".student-batch-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
        "#studentBatchWorkspace .student-batch-actionbar{position:sticky;bottom:0;z-index:15;margin-top:16px;padding:12px;background:rgba(255,255,255,.96);border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 -5px 18px rgba(15,23,42,.08);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}",
        "@media(max-width:760px){.student-batch-two{grid-template-columns:1fr}.student-batch-step .label{display:none}#studentBatchTopNav{overflow-x:auto;flex-wrap:nowrap}.student-batch-step{flex:none}}"
      ].join("");
      shell.appendChild(style);

      grid.style.display = "none";

      const workspace = document.createElement("div");
      workspace.id = "studentBatchWorkspace";

      const nav = document.createElement("nav");
      nav.id = "studentBatchTopNav";
      [
        ["1","Setup","studentBatchSectionSetup"],
        ["2","Photos & Branding","studentBatchSectionVisual"],
        ["3","Print & Export","studentBatchSectionOutput"]
      ].forEach(([n,label,target],i) => {
        const b=document.createElement("button");
        b.type="button";
        b.className="student-batch-step"+(i===0?" active":"");
        b.innerHTML='<span class="num">'+n+'</span><span class="label">'+label+'</span>';
        b.addEventListener("click",()=>document.getElementById(target)?.scrollIntoView({behavior:"smooth",block:"start"}));
        nav.appendChild(b);
      });

      const all=document.createElement("div");
      all.id="studentBatchAllContent";

      const wrap=(id,title,desc,content)=>{
        const s=document.createElement("section");
        s.id=id;s.className="student-batch-section";
        s.innerHTML='<div class="student-batch-section-title">'+title+'</div><div class="student-batch-section-sub">'+desc+'</div>';
        s.appendChild(content);return s;
      };

      template.className="student-batch-card";
      excel.className="student-batch-card";
      mapping.className="student-batch-card";
      photoBrand.className="student-batch-card";
      print.className="student-batch-card student-batch-print-section";

      const setupGrid=document.createElement("div");
      setupGrid.className="student-batch-two";
      setupGrid.append(template,excel);
      const setup=document.createElement("div");
      setup.append(setupGrid,mapping);

      const visual=document.createElement("div");
      visual.appendChild(photoBrand);

      const output=document.createElement("div");
      output.appendChild(print);

      all.append(
        wrap("studentBatchSectionSetup","1. Template & student data","Load everything needed to build the cards. Nothing is hidden behind another step.",setup),
        wrap("studentBatchSectionVisual","2. Photos & school branding","Add student photos, badge and school identity. All controls remain visible on this page.",visual),
        wrap("studentBatchSectionOutput","3. Print & export","Set paper, orientation, copies, resolution and layout, then preview and generate.",output)
      );

      const actions=document.createElement("div");
      actions.className="student-batch-actionbar";
      const preview=document.createElement("button");
      preview.type="button";preview.className="student-batch-step";preview.textContent="Refresh preview";
      preview.onclick=()=>Batch.previewBatch();
      const top=document.createElement("button");
      top.type="button";top.className="student-batch-step";top.textContent="Back to top";
      top.onclick=()=>workspace.scrollIntoView({behavior:"smooth",block:"start"});
      actions.append(preview,top);

      workspace.append(nav,all,actions);
      shell.insertBefore(workspace,grid);

      const observer=new IntersectionObserver(entries=>{
        const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
        if(!visible)return;
        nav.querySelectorAll(".student-batch-step").forEach(b=>b.classList.toggle("active",b.querySelector(".label")?.textContent===(
          visible.target.id==="studentBatchSectionSetup"?"Setup":visible.target.id==="studentBatchSectionVisual"?"Photos & Branding":"Print & Export"
        )));
      },{root:null,threshold:[0.2,0.5,0.8]});
      [setup,visual,output].forEach((_,i)=>observer.observe(document.getElementById(["studentBatchSectionSetup","studentBatchSectionVisual","studentBatchSectionOutput"][i])));

      shell.querySelectorAll("*").forEach(el=>{
        if(el.children.length===0 && /fal\.ai/i.test(el.textContent||"")) el.textContent=el.textContent.replace(/fal\.ai/gi,"browser-local AI");
      });
      modal.dataset.organized="true";
    },
    open() {
      this.organizeUI();
      document.getElementById("studentBatchModal")?.classList.remove("hidden");
      this.restoreSavedBadge();
      this.restoreSchoolName();
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

    async loadTemplate(file, options = {}) {
      if (!file) return;
      try {
        const text = await file.text();
        const ext = file.name.split(".").pop().toLowerCase();
        this.state.templateFile = file;
        this.state.templateName = file.name;

        if (ext === "html" || ext === "htm") {
          await this.loadHtmlTemplate(text);

          // A user-selected custom template is a reusable asset, not a
          // one-time upload. Persist its actual HTML bytes in the local
          // template library so it appears under Start from Template.
          if (!options.fromLibrary && window.App?.templates?.saveTemplateToLibrary) {
            const saved = await window.App.templates.saveTemplateToLibrary(file.name, text, "html");
            if (saved?.id) this.state.templateLibraryId = saved.id;
          } else {
            this.state.templateLibraryId = String(options.libraryId || "");
          }
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

          if (!options.fromLibrary && window.App?.templates?.saveTemplateToLibrary) {
            const saved = await window.App.templates.saveTemplateToLibrary(file.name, text, "paper");
            if (saved?.id) this.state.templateLibraryId = saved.id;
          } else {
            this.state.templateLibraryId = String(options.libraryId || "");
          }

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

      // Preserve the supplied template as the source of truth while removing
      // only the generic detail-value underline that was causing unwanted
      // horizontal rules in generated cards.
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

        // These are visual placeholder labels, not data fields.
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
            const isOutputPaired =
              !!doc.querySelector("#out-" + inMatch[1] + ", #out_" + inMatch[1]);
            const isControl =
              /^(?:badge[-_]?(?:file|url)|file|url|button|submit|reset|search)$/i.test(inMatch[1]);

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

      // Automatic mapping is intentionally conservative. Only an exact
      // normalized match is accepted. Anything uncertain is left for the
      // user to map explicitly in the mapping panel.
      const exact = headers.filter(header => this.normalize(header) === key);
      return exact.length === 1 ? exact[0] : null;
    },

    getHeaderSuggestion(field) {
      const headers = this.state.headers || [];
      const key = this.normalize(field);
      if (!key || !headers.length) return null;

      // Provide a suggestion for the UI, but never silently apply it.
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

          return '<div class="grid grid-cols-[minmax(130px,1fr)_minmax(160px,1fr)] items-center gap-3 py-2 border-b border-slate-100 last:border-0">' +
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

        return '<div class="grid grid-cols-[minmax(130px,1fr)_minmax(160px,1fr)] items-center gap-3 py-2 border-b border-slate-100 last:border-0">' +
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

    // Resolve worksheet XML paths to their actual workbook sheet names.
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
          workbookRelMap[id] = this.resolveZipPath(
            "xl/_rels/workbook.xml.rels",
            target
          );
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
    
    // Find all worksheet XML files in the zip
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
      const drawingNodes = Array.from(sheetDoc.getElementsByTagName("*")).filter(el => el.localName.toLowerCase() === "drawing");
      if (!drawingNodes.length) continue;

      const drawingRelId = drawingNodes[0].getAttribute("r:id") ||
        drawingNodes[0].getAttribute("id") ||
        Array.from(drawingNodes[0].attributes).find(a => a.localName === "id")?.value;
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
        const relId = blipNode.getAttribute("r:embed") ||
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
          // Do not reject a workbook merely because the first selected sheet
          // has headers without records. Give a precise message and keep the
          // importer ready for another sheet.
          throw new Error("The selected worksheet has headers but no student records. Choose the sheet containing the student table.");
        }

        // Embedded images are keyed by the source worksheet XML plus the
        // absolute zero-based worksheet row. This keeps images attached to
        // the correct student even when blank rows exist.
        this.state.rows = rows.map(row => {
          const copy = { ...row };
          const excelRowIndex = Number(row.__worksheetRowIndex);
          const embedded = this.state.embeddedPhotos.get(sheetName + "::" + excelRowIndex);
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
        Utils.toast("Excel import failed: " + e.message, "error");
      }
    },

    async loadPhotos(files) {
      this.state.photoFiles.clear();
      this.state.enhancedPhotoCache.clear();
      for (const file of Array.from(files || [])) {
        this.state.photoFiles.set(file.name.toLowerCase(), file);
        this.state.photoFiles.set(file.name.replace(/\.[^.]+$/, "").toLowerCase(), file);
      }
      this.refresh();
      this.notify(Math.floor(this.state.photoFiles.size / 2) + " photo files indexed • Excel photo fields will be matched automatically");
    },

    async loadBadge(file) {
      if (!file) return;
      if (!/^image\//i.test(file.type || "") && !/\.(?:png|jpe?g|webp|gif|svg)$/i.test(file.name || "")) {
        Utils.toast("Please select a badge or logo image (PNG, JPG, WEBP, GIF or SVG).", "error");
        return;
      }

      try {
        this.state.badgeFile = file;
        this.state.badgeDataUrl = await this.fileToDataUrl(file);
        this.state.badgeLibraryId = "";
        this.refresh();
        Utils.toast("Badge / logo loaded: " + file.name);

        // Persist every uploaded badge into the reusable Template Badges library.
        // The browser copy survives closing/reopening the application.
        if (window.App?.templates?.saveBadgeToLibrary) {
          const saved = await window.App.templates.saveBadgeToLibrary(file.name, this.state.badgeDataUrl, true);
          if (saved?.id) this.state.badgeLibraryId = saved.id;
        }
      } catch (e) {
        console.error(e);
        this.state.badgeFile = null;
        this.state.badgeDataUrl = "";
        Utils.toast("Badge / logo could not be loaded: " + e.message, "error");
      }
    },

    clearBadge(silent = false) {
      this.state.badgeFile = null;
      this.state.badgeDataUrl = "";
      this.state.badgeLibraryId = "";
      this.refresh();
      if (!silent) Utils.toast("Uploaded badge / logo removed. The template's original artwork will be used.");
    },

    useSavedBadge(name, dataUrl, id = "") {
      if (!dataUrl) return;
      this.state.badgeFile = { name: String(name || "Saved Template Badge"), type: "image/*" };
      this.state.badgeDataUrl = String(dataUrl);
      this.state.badgeLibraryId = String(id || "");
      this.refresh();
    },

    async restoreSavedBadge() {
      if (this.state.badgeDataUrl || !window.App?.templates?.getSavedBadges) return;
      try {
        const selectedId = localStorage.getItem(window.App.templates.selectedBadgeKey || "");
        if (!selectedId) return;
        const badges = await window.App.templates.getSavedBadges();
        const badge = badges.find(item => item.id === selectedId);
        if (badge) this.useSavedBadge(badge.name, badge.dataUrl, badge.id);
      } catch (e) {
        console.warn("Could not restore saved template badge.", e);
      }
    },

    resolveValue(row, field) {
      // Badge artwork is supplied by the mapping panel, not by Excel.
      // Every badge field in the selected HTML template uses this uploaded PNG.
      if (this.isBadgeField(field)) return this.state.badgeDataUrl || "";

      const header = this.state.mapping[field];
      if (header && row[header] !== undefined) return row[header];
      if (row[field] !== undefined) return row[field];
      const h = this.findHeader(field);
      return h && row[h] !== undefined ? row[h] : "";
    },

    displayValue(row, field) {
      const value = this.resolveValue(row, field);
      // Excel is the only source for populated values. Empty stays empty.
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
    photoManualDefaults() {
      return {brightness:0,exposure:0,shadows:0,highlights:0,contrast:0,saturation:0,temperature:0,sharpness:0,faceLighting:0,cropScale:100,positionX:0,positionY:0,opacity:100};
    },

    setPhotoManual(name, value) {
      const defaults = this.photoManualDefaults();
      if (!Object.prototype.hasOwnProperty.call(defaults, name)) return;
      let next = Number(value);
      if (!Number.isFinite(next)) next = defaults[name];
      const ranges = {
        brightness:[-100,100], exposure:[-100,100], shadows:[-100,100],
        highlights:[-100,100], contrast:[-100,100], saturation:[-100,100],
        temperature:[-100,100], sharpness:[0,100], faceLighting:[0,100],
        cropScale:[100,250], positionX:[-50,50], positionY:[-50,50], opacity:[0,100]
      };
      const range = ranges[name] || [-100,100];
      this.state.photoEnhancement.manual[name] = Math.max(range[0],Math.min(range[1],next));
      this.state.enhancedPhotoCache.clear();
      this.syncPhotoEditorControls();
      this.previewBatch();
    },

    resetPhotoManual() {
      this.state.photoEnhancement.manual = this.photoManualDefaults();
      this.state.enhancedPhotoCache.clear();
      this.syncPhotoEditorControls();
      this.previewBatch();
      this.notify("Manual photo adjustments reset.");
    },

    syncPhotoEditorControls() {
      const m = this.state.photoEnhancement.manual || this.photoManualDefaults();
      Object.keys(m).forEach(key => {
        const el = document.getElementById("studentBatchPhotoManual_" + key);
        const value = document.getElementById("studentBatchPhotoManualValue_" + key);
        if (el && String(el.value) !== String(m[key])) el.value = m[key];
        if (value) value.textContent = key === "cropScale" ? m[key] + "%" : key === "opacity" ? m[key] + "%" : String(m[key]);
      });
    },

    async enhanceStudentPhoto(dataUrl) {
      if (!dataUrl) return dataUrl;

      const m = this.state.photoEnhancement.manual || this.photoManualDefaults();
      const manualIsNeutral = m.brightness===0 && m.exposure===0 && m.shadows===0 && m.highlights===0 &&
        m.contrast===0 && m.saturation===0 && m.temperature===0 && m.sharpness===0 &&
        m.faceLighting===0 && m.cropScale===100 && m.positionX===0 && m.positionY===0 && m.opacity===100;

      const needsProcessing = this.state.photoEnhancement.enabled || this.state.photoEnhancement.whiteBackground || !manualIsNeutral;
      if (!needsProcessing) return dataUrl;

      const key = dataUrl + "|" + JSON.stringify({
        upscaler:true,
        enabled:this.state.photoEnhancement.enabled,
        whiteBackground:this.state.photoEnhancement.whiteBackground,
        strength:this.state.photoEnhancement.strength,
        manual:m
      });
      const cached = this.state.enhancedPhotoCache.get(key);
      if (cached) return cached;

      let working = dataUrl;

      // Browser-local super-resolution replaces the old Fal.ai network path.
      // Photos stay on the user device. ESRGAN Medium 2x is used only for
      // genuinely small portraits, then the deterministic local finishing
      // pass handles print brightness, shadows, face lighting and sharpening.
      if (this.state.photoEnhancement.enabled && window.Upscaler && window.ESRGANMedium2x) {
        try {
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = dataUrl;
          });
          const maxSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);

          // Do not invent detail in photos that already have enough pixels.
          if (maxSide < 1200) {
            if (!this._photoUpscaler) {
              this._photoUpscaler = new window.Upscaler({ model: window.ESRGANMedium2x });
            }
            working = await this._photoUpscaler.upscale(img, {
              output: "base64",
              patchSize: 64,
              padding: 4,
              awaitNextFrame: true
            });
          }
        } catch (error) {
          console.warn("UpscalerJS unavailable for this photo; using local enhancement.", error);
        }
      }

      try {
        // Guaranteed local print-safety finishing pass.
        if (window.JoesStudentPhotoEnhancer?.process) {
          const enhanced = await window.JoesStudentPhotoEnhancer.process(working, {
            auto: true,
            strength: this.state.photoEnhancement.strength,
            whiteBackground: this.state.photoEnhancement.whiteBackground,
            manual: m
          });
          this.state.enhancedPhotoCache.set(key, enhanced);
          return enhanced;
        }

        this.state.enhancedPhotoCache.set(key, working);
        return working;
      } catch (error) {
        console.warn("Student photo finishing pass failed; using original/upscaled photo.", error);
        this.state.enhancedPhotoCache.set(key, working);
        return working;
      }
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

      // Keep an existing image proxy URL intact. Wrapping it in another
      // images.weserv.nl request creates a nested proxy URL and returns 404.
      if (/^https?:\/\/images\.weserv\.nl\//i.test(raw)) return raw;

      if (/^https?:\/\//i.test(raw) &&
          !/^https?:\/\/(?:quranhub1\.github\.io|localhost|127\.0\.0\.1)(?::\d+)?\//i.test(raw)) {
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
      this.applyCardBackground(body);
      this.applyBranding(body);

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
          let photoData = await this.resolvePhoto(this.resolveValue(row, field), row, field);
          if (photoData) photoData = await this.enhanceStudentPhoto(photoData);

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
      this.applyBranding(body);

      const all = body.querySelectorAll("*");

      for (const el of all) {
        for (const attr of Array.from(el.attributes)) {
          if (!attr.value.includes("{{")) continue;
          const replaced = this.replacePlaceholders(attr.value, row);
          el.setAttribute(attr.name, replaced);
        }

        const idMatch = String(el.id || "").match(/^(?:out|in|field|data)[-_](.+)$/i);
        if (idMatch) {
          const field = idMatch[1].replace(/[-_]+/g, " ");
          if (this.isBadgeField(field)) {
            if (this.state.badgeDataUrl) {
              await this.putImageIntoBoundElement(el, this.state.badgeDataUrl, field, row);
            }
          } else if (this.isStudentPhotoField(field)) {
            let photoVal = await this.resolvePhoto(this.resolveValue(row, field), row, field);
            if (photoVal) photoVal = await this.enhanceStudentPhoto(photoVal);
            if (photoVal) {
              await this.putImageIntoBoundElement(el, photoVal, field, row);
            }
          } else if (!/^in[-_]/i.test(el.id)) {
            const textVal = this.displayValue(row, field);
            if (textVal) el.textContent = textVal;
          }
        }

        const bind = el.getAttribute("data-bind") || el.getAttribute("data-field");
        if (bind) {
          const value = this.resolveValue(row, bind);
          if (this.isImageField(bind)) {
            let imageValue = value;
            if (this.isStudentPhotoField(bind) && imageValue) imageValue = await this.enhanceStudentPhoto(await this.resolvePhoto(value, row, bind));
            await this.putImageIntoBoundElement(el, imageValue, bind, row);
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

      // Apply a subtle JOES STUDIO watermark to every generated card.
      // It is deliberately low-contrast so it identifies the studio without
      // competing with student data, photos, badges, QR codes, or print text.
      if (!body.querySelector(".joes-studio-watermark")) {
        const watermark = body.ownerDocument.createElement("div");
        watermark.className = "joes-studio-watermark";
        watermark.textContent = "JOES STUDIO";
        watermark.setAttribute("aria-hidden", "true");
        watermark.style.cssText = [
          "position:absolute",
          "left:50%",
          "top:53%",
          "transform:translate(-50%,-50%) rotate(-16deg)",
          "z-index:0",
          "pointer-events:none",
          "user-select:none",
          "white-space:nowrap",
          "font-family:Georgia, 'Times New Roman', serif",
          "font-size:20px",
          "font-weight:700",
          "font-style:italic",
          "letter-spacing:2.8px",
          "line-height:1",
          "color:rgba(29,53,87,.11)",
          "text-shadow:0 1px 0 rgba(255,255,255,.28)",
          "mix-blend-mode:multiply"
        ].join(";");
        body.style.position = body.style.position || "relative";
        body.insertBefore(watermark, body.firstChild);
      }
      const watermark = body.querySelector(".joes-studio-watermark");
      if (watermark) {
        watermark.style.zIndex = "0";
        Array.from(body.children).forEach(child => {
          if (child !== watermark && !child.style.zIndex) child.style.position = child.style.position || "relative";
        });
      }

      // Final guard: no unresolved image placeholder may reach the DOM.
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
        "overflow:hidden", "background:" + this.normalizeCardColor(this.state.cardBackground)
      ].join(";");
      const styles = document.createElement("style");
      styles.textContent = this.state.htmlStyles;
      wrapper.appendChild(styles);
      // Keep the actual card root. The template stylesheet targets
      // .exam-card (and similar root selectors), so moving only its children
      // strips the selector that controls the badge, fields, borders and
      // internal positioning. That is why only the badge was surviving.
      const cardClone = body.cloneNode(true);
      // Preserve the selected template's own geometry and styles.
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

        // External images such as the KSHS badge must be inlined before the
        // card is serialized into a data-SVG. Browsers may show the image in
        // the live preview but silently drop it when that SVG is rasterized
        // for the PDF. Fetching it into a data URL makes the preview/export
        // renderer deterministic.
        img.setAttribute("crossorigin", "anonymous");
        try {
          // GitHub Pages cannot fetch arbitrary external images when the
          // source server omits CORS headers. Do not request the original
          // URL first, because that only produces a console error and still
          // leaves the export renderer without the image.
          // buildHtmlCard may already have converted external sources
          // to images.weserv.nl. Never proxy a proxy URL again.
          let proxyUrl = src;
          if (!/^https?:\/\/images\.weserv\.nl\//i.test(src)) {
            proxyUrl = "https://images.weserv.nl/?url=" + encodeURIComponent(src);
          }

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
          // Keep the original source as a last-resort browser rendering path.
          // Do not replace the actual badge with a fake placeholder.
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
      const baseCard = {
        w: Math.max(1, Number(this.state.cardWidthMm) || 130),
        h: Math.max(1, Number(this.state.cardHeightMm) || 60)
      };
      const sheet = this.getSheetSize();
      const margin = Math.max(0, Number(this.state.margin) || 0);
      const gx = Math.max(0, Number(this.state.gapX) || 0);
      const gy = Math.max(0, Number(this.state.gapY) || 0);
      const requested = Math.max(1, Number(this.state.cardsPerPage) || 1);

      // Batch cards must keep the template's real geometry. The old layout
      // algorithm enlarged cards to fill each grid cell, which meant a
      // 130 x 60 mm template could silently become a different physical size.
      // Fit the requested number of cards without stretching them. If the
      // requested layout cannot physically fit, reduce the card uniformly.
      let best = null;

      for (let cols = 1; cols <= requested; cols++) {
        const rows = Math.ceil(requested / cols);
        const availableW = sheet.w - margin * 2 - Math.max(0, cols - 1) * gx;
        const availableH = sheet.h - margin * 2 - Math.max(0, rows - 1) * gy;
        if (availableW <= 0 || availableH <= 0) continue;

        const scale = Math.min(1, availableW / baseCard.w, availableH / baseCard.h);
        const usedW = baseCard.w * scale;
        const usedH = baseCard.h * scale;
        const fill = (usedW * usedH) / Math.max(1, availableW * availableH);
        const shapePenalty = Math.abs(Math.log(cols / rows));
        const score = fill - shapePenalty * 0.01;

        if (!best || score > best.score) {
          best = { cols, rows, cellW: availableW / cols, cellH: availableH / rows, scale, usedW, usedH, score };
        }
      }

      if (!best) {
        best = {
          cols: 1,
          rows: 1,
          cellW: Math.max(baseCard.w, sheet.w - margin * 2),
          cellH: Math.max(baseCard.h, sheet.h - margin * 2),
          scale: Math.min(1, (sheet.w - margin * 2) / baseCard.w, (sheet.h - margin * 2) / baseCard.h),
          usedW: baseCard.w,
          usedH: baseCard.h,
          score: 0
        };
        best.usedW = baseCard.w * best.scale;
        best.usedH = baseCard.h * best.scale;
      }

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
            if (this.state.photoFiles.size) {
              const firstPhoto = this.state.photoFiles.values().next().value;
              const dataUrl = firstPhoto ? await this.fileToDataUrl(firstPhoto) : "";
              if (dataUrl) {
                const previewRow = { __embeddedPhoto: dataUrl };
                const result = await this.buildHtmlCard(previewRow);
                const maxPageWidth = Math.min(900, Math.max(420, host.clientWidth - 24));
                const previewW = Math.min(560, maxPageWidth);
                const ratio = (Number(this.state.cardHeightMm) || 60) / (Number(this.state.cardWidthMm) || 130);
                const wrapper = document.createElement("div");
                wrapper.className = "student-batch-preview-card";
                wrapper.style.cssText = "position:relative;overflow:hidden;width:"+previewW+"px;height:"+Math.round(previewW*ratio)+"px;margin:0 auto;background:"+this.normalizeCardColor(this.state.cardBackground);
                const style = document.createElement("style");
                style.textContent = this.state.htmlStyles;
                wrapper.appendChild(style);
                const body = result.body.cloneNode(true);
                this.sanitizePlaceholderImages(body);
                this.proxyExternalPreviewImages(body);
                body.style.margin = "0";
                body.style.boxSizing = "border-box";
                wrapper.appendChild(body);
                host.innerHTML = "";
                host.style.display = "flex";
                host.style.flexDirection = "column";
                host.style.alignItems = "stretch";
                host.appendChild(wrapper);
                const status = document.getElementById("studentBatchPreviewStatus");
                if (status) status.textContent = "Live template preview • first selected photo • Excel data not loaded";
                return;
              }
            }
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
            frame.style.backgroundColor = this.normalizeCardColor(this.state.cardBackground);
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
              "overflow:hidden",
              "background:" + this.normalizeCardColor(this.state.cardBackground)
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

          const info = document.createElement("div");
          info.className = "text-xs text-slate-500 text-center mt-2";
          info.textContent = "Live print preview • " + previewRows.length + " card" +
            (previewRows.length === 1 ? "" : "s") + " • Excel data integrated • " +
            this.state.orientation + " • " + this.state.sheetSize +
            " • " + layout.cols + " × " + layout.rows + " layout";
          host.appendChild(info);

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

        // The KSHS image server does not send CORS headers. The browser can
        // display the image in some contexts, but the preview/export pipeline
        // cannot reliably use it from GitHub Pages. Route external template
        // images through the same public image proxy used by PDF export.
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
      wrapper.style.backgroundColor = this.normalizeCardColor(this.state.cardBackground);
      wrapper.style.width = Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) + "px";
      wrapper.style.height = (Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) * this.state.cardHeightMm / this.state.cardWidthMm) + "px";
      const style = document.createElement("style");
      style.textContent = this.state.htmlStyles;
      wrapper.appendChild(style);
      // Preserve the selected template's actual root element. Moving only its
      // children loses root-level classes, inline sizing, borders and layout.
      const body = source.cloneNode(true);
      // Never allow literal template placeholders such as {{photo}} to become
      // browser requests like /{{photo}}. They are intentionally blank until
      // Excel/photo data is available.
      this.sanitizePlaceholderImages(body);
      this.applyBranding(body);
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
      const badgeNameEl = document.getElementById("studentBatchBadgeName");
      const badgePreviewEl = document.getElementById("studentBatchBadgePreview");
      const badgeClearEl = document.getElementById("studentBatchBadgeClear");
      const badgeClearInlineEl = document.getElementById("studentBatchBadgeClearInline");
      const badgePreviewInlineEl = document.getElementById("studentBatchBadgePreviewInline");
      const badgeNameInlineEl = document.getElementById("studentBatchBadgeNameInline");
      const schoolNameEl = document.getElementById("studentBatchSchoolName");
      const brandingStatusEl = document.getElementById("studentBatchBrandingStatus");

      const bgInput = document.getElementById("studentBatchCardBackground");
      const bgHexInput = document.getElementById("studentBatchCardBackgroundHex");
      const bgValue = this.normalizeCardColor(this.state.cardBackground);
      if (bgInput && bgInput.value !== bgValue) bgInput.value = bgValue;
      if (bgHexInput && bgHexInput.value.toLowerCase() !== bgValue) bgHexInput.value = bgValue;

      if (fileEl) fileEl.textContent = this.state.templateName || "No template selected";
      if (excelEl) excelEl.textContent = this.state.rows.length ? "Excel data loaded" : "No Excel file selected";
      if (countEl) countEl.textContent = String(this.state.rows.length);
      if (photoEl) photoEl.textContent = this.state.photoFiles.size ? "Photo folder indexed" : "No photo folder (optional)";
      if (badgeNameEl) {
        badgeNameEl.textContent = this.state.badgeFile?.name
          ? "Uploaded: " + this.state.badgeFile.name
          : "Using the selected template's original badge/logo";
      }
      if (badgePreviewEl) {
        badgePreviewEl.innerHTML = this.state.badgeDataUrl
          ? '<img src="' + this.imageSourceForTemplate(this.state.badgeDataUrl) + '" alt="" class="max-h-full max-w-full object-contain p-1">'
          : '<i class="ph ph-image text-slate-300 text-lg"></i>';
      }
      if (badgeClearEl) badgeClearEl.classList.toggle("hidden", !this.state.badgeDataUrl);
      if (schoolNameEl && schoolNameEl.value !== this.state.schoolName) schoolNameEl.value = this.state.schoolName;
      if (brandingStatusEl) brandingStatusEl.textContent = this.state.schoolNameCustomized || this.state.badgeDataUrl ? "Customized" : "Template default";
      if (badgeNameInlineEl) badgeNameInlineEl.textContent = this.state.badgeFile?.name ? "Uploaded: " + this.state.badgeFile.name : "Using template artwork";
      if (badgePreviewInlineEl) badgePreviewInlineEl.innerHTML = this.state.badgeDataUrl
        ? '<img src="' + this.imageSourceForTemplate(this.state.badgeDataUrl) + '" alt="" class="w-full h-full object-contain p-1">'
        : '<i class="ph ph-seal text-slate-300 text-xl"></i>';
      if (badgeClearInlineEl) badgeClearInlineEl.classList.toggle("hidden", !this.state.badgeDataUrl);
      if (sizeEl) sizeEl.textContent = (Number(this.state.cardWidthMm).toFixed(1) + " × " + Number(this.state.cardHeightMm).toFixed(1) + " mm");

      const l = this.layout();
      if (layoutEl) layoutEl.textContent = l.cols + " × " + l.rows + " = " + l.perPage + " cards/page • " + this.state.orientation + " • " + this.state.resolution + " DPI";

      if (fieldsEl) this.renderFieldMapping(fieldsEl);

      const optionalUnmappedFields = this.state.templateFields.filter(field =>
        !this.isBadgeField(field) && !this.isStudentPhotoField(field) && !this.state.mapping[field]
      );
      const batchReady =
        !!this.state.rows.length &&
        !!this.state.templateFile;



      const generate = document.getElementById("studentBatchGenerate");
      if (generate) {
        // Badge/logo upload is optional. A selected template may already contain
        // its own logo, or the badge field may intentionally remain empty.
        generate.disabled = !batchReady;
        generate.title = optionalUnmappedFields.length
          ? "Unmapped template fields will be left blank."
          : "";
      }

      const print = document.getElementById("studentBatchPrint");
      if (print) {
        print.disabled = !batchReady;
        print.title = optionalUnmappedFields.length
          ? "Unmapped template fields will be left blank."
          : "";
      }

      if (this.state.templateMode === "html") this.previewBatch();
    },

    async print() {
      if (!this.state.rows.length || !this.state.templateFile || !this.state.templateFields.length) {
        Utils.toast("Select an HTML template and Excel data first.", "error");
        return;
      }

      const button = document.getElementById("studentBatchPrint");
      const oldHtml = button ? button.innerHTML : "";
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="ph ph-spinner animate-spin mr-1"></i> Preparing...';
      }

      const layout = this.layout();
      const copies = Math.max(1, Number(this.state.copies) || 1);
      const totalCards = this.state.rows.length * copies;
      const totalPages = Math.max(1, Math.ceil(totalCards / layout.perPage));
      const sheet = layout.sheet;
      const nativeW = Math.max(1, Math.round((Number(this.state.cardWidthMm) || 130) * 96 / 25.4));
      const nativeH = Math.max(1, Math.round((Number(this.state.cardHeightMm) || 60) * 96 / 25.4));

      let iframe = null;

      try {
        App.ui.showLoading("Preparing batch print...");

        // Create the print frame while still inside the user click event. This
        // avoids popup/print-dialog blocking after the asynchronous card build.
        iframe = document.createElement("iframe");
        iframe.id = "student-batch-print-iframe";
        iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
        document.body.appendChild(iframe);

        const printDoc = iframe.contentWindow.document;
        printDoc.open();
        printDoc.write(
          "<!doctype html><html><head><meta charset=\"utf-8\"><title>Student Batch Print</title></head><body></body></html>"
        );
        printDoc.close();

        const style = printDoc.createElement("style");
        style.textContent = [
          "@page{size:" + sheet.w + "mm " + sheet.h + "mm;margin:0;}",
          "html,body{margin:0!important;padding:0!important;width:" + sheet.w + "mm;background:#fff;}",
          "body{display:block!important;}",
          ".student-batch-print-page{position:relative;box-sizing:border-box;width:" + sheet.w + "mm;height:" + sheet.h + "mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always;}",
          ".student-batch-print-page:last-child{break-after:auto;page-break-after:auto;}",
          ".student-batch-print-frame{position:absolute;overflow:hidden;box-sizing:border-box;background:" + this.normalizeCardColor(this.state.cardBackground) + ";}",
          ".student-batch-print-stage{position:absolute;left:0;top:0;transform-origin:top left;overflow:hidden;}",
          "@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}",
          this.state.htmlStyles || ""
        ].join("\n");
        printDoc.head.appendChild(style);

        const waitForImages = async root => {
          const images = Array.from(root.querySelectorAll("img"));
          await Promise.all(images.map(img => new Promise(resolve => {
            if (img.complete) {
              resolve();
              return;
            }
            const done = () => {
              img.removeEventListener("load", done);
              img.removeEventListener("error", done);
              resolve();
            };
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, 5000);
          })));
        };

        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
          const page = printDoc.createElement("div");
          page.className = "student-batch-print-page";

          const startCard = pageIndex * layout.perPage;
          const endCard = Math.min(totalCards, startCard + layout.perPage);

          for (let cardNumber = startCard; cardNumber < endCard; cardNumber++) {
            const sourceRowIndex = Math.floor(cardNumber / copies);
            const built = await this.buildHtmlCard(this.state.rows[sourceRowIndex]);

            const slot = cardNumber % layout.perPage;
            const col = slot % layout.cols;
            const row = Math.floor(slot / layout.cols);
            const cellX = Number(this.state.margin) + col * (layout.cellW + Number(this.state.gapX));
            const cellY = Number(this.state.margin) + row * (layout.cellH + Number(this.state.gapY));
            const xMm = cellX + (layout.cellW - layout.card.w) / 2;
            const yMm = cellY + (layout.cellH - layout.card.h) / 2;

            const frame = printDoc.createElement("div");
            frame.className = "student-batch-print-frame";
            frame.style.left = xMm + "mm";
            frame.style.top = yMm + "mm";
            frame.style.width = layout.card.w + "mm";
            frame.style.height = layout.card.h + "mm";

            const stage = printDoc.createElement("div");
            stage.className = "student-batch-print-stage";
            stage.style.backgroundColor = this.normalizeCardColor(this.state.cardBackground);
            stage.style.width = nativeW + "px";
            stage.style.height = nativeH + "px";
            stage.style.transform =
              "scaleX(" + ((layout.card.w * 96 / 25.4) / nativeW) + ") " +
              "scaleY(" + ((layout.card.h * 96 / 25.4) / nativeH) + ")";

            const cardClone = built.body.cloneNode(true);
            this.sanitizePlaceholderImages(cardClone);
            stage.appendChild(printDoc.importNode(cardClone, true));
            frame.appendChild(stage);
            page.appendChild(frame);

            if ((cardNumber + 1) % Math.max(1, Math.floor(totalCards / 10)) === 0 || cardNumber + 1 === totalCards) {
              App.ui.showLoading("Preparing print card " + (cardNumber + 1) + " of " + totalCards + "...");
            }
          }

          printDoc.body.appendChild(page);
        }

        await waitForImages(printDoc.body);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // Print the fully rendered batch, not the editor canvas.
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        Utils.toast("Print prepared: " + totalCards + " cards on " + totalPages + " pages.");
      } catch (e) {
        console.error("Student batch print failed", e);
        Utils.toast("Batch print failed: " + (e.message || "Unable to prepare print."), "error");
      } finally {
        App.ui.hideLoading();
        if (iframe) {
          setTimeout(() => {
            try { iframe.remove(); } catch (_) {}
          }, 1500);
        }
        if (button) {
          button.disabled = false;
          button.innerHTML = oldHtml;
        }
      }
    },

    async generate() {
      if (!this.state.rows.length || !this.state.templateFile) {
        Utils.toast("Select an HTML template and Excel data first.", "error");
        return;
      }

      // Badge upload is optional. Keep the template's existing badge/logo when
      // no custom PNG has been selected, or leave the badge slot empty when the
      // template uses an empty placeholder.
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

    setPhotoEnhancement(options = {}) {
      if (Object.prototype.hasOwnProperty.call(options, "enabled")) this.state.photoEnhancement.enabled = !!options.enabled;
      if (Object.prototype.hasOwnProperty.call(options, "whiteBackground")) this.state.photoEnhancement.whiteBackground = !!options.whiteBackground;
      if (options.strength) this.state.photoEnhancement.strength = String(options.strength);
      this.state.enhancedPhotoCache.clear();
      this.syncPhotoEditorControls();
      this.refresh();
      this.previewBatch();
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
    document.getElementById("studentBatchGenerate")?.addEventListener("click", event => {
      event.preventDefault();
      Batch.generate();
    });
    document.getElementById("studentBatchPrint")?.addEventListener("click", event => {
      event.preventDefault();
      Batch.print();
    });
    document.getElementById("studentBatchTemplateInput")?.addEventListener("change", e => Batch.loadTemplate(e.target.files[0]));
    document.getElementById("studentBatchExcelInput")?.addEventListener("change", e => Batch.loadExcel(e.target.files[0]));
    document.getElementById("studentBatchPhotoInput")?.addEventListener("change", e => Batch.loadPhotos(e.target.files));
    document.getElementById("studentBatchBadgeInput")?.addEventListener("change", e => Batch.loadBadge(e.target.files[0]));
    document.getElementById("studentBatchBadgeClear")?.addEventListener("click", () => Batch.clearBadge());
    document.getElementById("studentBatchBadgeClearInline")?.addEventListener("click", () => Batch.clearBadge());
    document.getElementById("studentBatchSchoolName")?.addEventListener("input", e => Batch.setSchoolName(e.target.value));
    document.getElementById("studentBatchBrandingReset")?.addEventListener("click", () => Batch.resetBranding());
    document.getElementById("studentBatchPhotoEnhance")?.addEventListener("change", e => Batch.setPhotoEnhancement({enabled:e.target.checked}));
    document.getElementById("studentBatchPhotoWhiteBg")?.addEventListener("change", e => Batch.setPhotoEnhancement({whiteBackground:e.target.checked}));
    document.getElementById("studentBatchPhotoStrength")?.addEventListener("change", e => Batch.setPhotoEnhancement({strength:e.target.value}));
    [
      "brightness","exposure","shadows","highlights","contrast","saturation","temperature",
      "sharpness","faceLighting","cropScale","positionX","positionY","opacity"
    ].forEach(key => {
      document.getElementById("studentBatchPhotoManual_" + key)?.addEventListener("input", e => Batch.setPhotoManual(key,e.target.value));
    });
    document.getElementById("studentBatchPhotoManualReset")?.addEventListener("click", () => Batch.resetPhotoManual());
    document.getElementById("studentBatchOrientation")?.addEventListener("change", e => { Batch.state.orientation = e.target.value; Batch.refresh(); });
    document.getElementById("studentBatchCardsPerPage")?.addEventListener("input", e => { Batch.state.cardsPerPage = Math.max(1, Number(e.target.value) || 1); Batch.refresh(); });
    document.getElementById("studentBatchResolution")?.addEventListener("change", e => { Batch.state.resolution = Number(e.target.value) || 300; Batch.refresh(); });
    document.getElementById("studentBatchCardBackground")?.addEventListener("input", e => {
      Batch.setCardBackground(e.target.value);
    });
    document.getElementById("studentBatchCardBackgroundHex")?.addEventListener("change", e => {
      Batch.setCardBackground(e.target.value);
    });
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
    Batch.syncPhotoEditorControls();
    Batch.previewBatch();
  });
})();