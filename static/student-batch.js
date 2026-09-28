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
              const firstPhoto = Array.from(this.state.photoFiles.values())[0];
              const dataUrl = firstPhoto ? await this.fileToDataUrl(firstPhoto) : "";
              if (dataUrl) {
                const previewRow = { __embeddedPhoto: dataUrl };
                const result = await this.buildHtmlCard(previewRow);
                const maxPageWidth = Math.min(900, Math.max(420, host.clientWidth - 24));
                const previewW = Math.min(560, maxPageWidth);
                const ratio = (Number(this.state.cardHeightMm) || 60) / (Number(this.state.cardWidthMm) || 130);
                const wrapper = document.createElement("div");
                wrapper.className = "student-batch-preview-card";
                wrapper.style.cssText = "position:relative;overflow:hidden;width:"+previewW+"px;height:"+Math.round(previewW*ratio)+"px;margin:0 auto;background:"+this.normalizeCardColor(this.state.cardBackground)+";border:1px solid #cbd5e1;border-radius:8px;";
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
            try {
              const result = await this.buildHtmlCard(rowData);
              builtCards.push(result.body);
            } catch (cardError) {
              console.warn("Could not build individual preview card:", cardError);
              throw new Error("Failed to render card: " + cardError.message);
            }
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
          const status = document.getElementById("studentBatchPreviewStatus");
          if (status) status.textContent = "Preview error: " + (e.message || "Unknown error");
        }
      }, 250);
    },

    renderTemplatePreview() {
      const host = document.getElementById("studentBatchPrintPreview");
      if (!host || this.state.templateMode !== "html" || !this.state.htmlText) {
        if (host) host.innerHTML = "";
        return;
      }
      try {
        host.innerHTML = "";
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.state.htmlText, "text/html");
        if (doc.body.textContent.toLowerCase().includes("parsererror")) {
          throw new Error("The HTML template contains invalid markup.");
        }
        doc.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());
        const source = this.findHtmlCardRoot(doc);
        if (!source) {
          throw new Error("No card root element found in template.");
        }
        const wrapper = document.createElement("div");
        wrapper.className = "student-batch-preview-card";
        wrapper.style.backgroundColor = this.normalizeCardColor(this.state.cardBackground);
        wrapper.style.width = Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) + "px";
        wrapper.style.height = (Math.min(260, Math.max(160, this.state.cardWidthMm * 2.4)) * this.state.cardHeightMm / this.state.cardWidthMm) + "px";
        wrapper.style.margin = "0 auto";
        wrapper.style.borderRadius = "8px";
        wrapper.style.border = "1px solid #cbd5e1";
        wrapper.style.overflow = "hidden";
        const style = document.createElement("style");
        style.textContent = this.state.htmlStyles;
        wrapper.appendChild(style);
        const body = source.cloneNode(true);
        this.sanitizePlaceholderImages(body);
        this.applyBranding(body);
        this.proxyExternalPreviewImages(body);
        body.style.margin = "0";
        body.style.boxSizing = "border-box";
        wrapper.appendChild(body);
        host.appendChild(wrapper);
      } catch (e) {
        console.error("Template preview rendering failed:", e);
        host.innerHTML =
          '<div class="flex flex-col items-center justify-center min-h-[220px] text-sm text-red-500 text-center p-4">' +
          "<strong>Template preview unavailable</strong><span class=\"mt-1\">" +
          escapeHtml(e.message || "Unable to render the template.") + "</span></div>";
      }
    },
