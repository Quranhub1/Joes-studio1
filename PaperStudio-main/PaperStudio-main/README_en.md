# 📄 PaperStudio - Simple and Easy-to-Use Paper Printing Design Tool

**PaperStudio** is a web-based, lightweight, and powerful visual printing design tool. It requires no installation — just open it in your browser. It supports designing various standard office papers and calligraphy practice papers, and comes with powerful **variable data** functionality. By importing Excel data, you can easily achieve batch generation and printing of labels, certificates, employee badges, pay slips, and more.

---

## ✨ Core Highlights

### 1. 🎨 Rich Paper Template Library

Built-in multiple preset templates to meet different scenario needs, supporting one-click parameter adjustment:

* **Common Sizes**: A3, A4, A5, B4, B5 and other standard sizes, plus custom sizes.
* **Office/Academic**: Lined paper, grid paper, English paper, music staff paper.
* **Calligraphy/Traditional**: Tian-zi grid, Mi-zi grid, Hui-zi grid, Nine-palace grid (supports custom colors, dashed lines).
* **Geometric Shapes**: Dot matrix paper, triangular grid, hexagonal grid.

### 2. 🚀 Powerful Variable Data Printing

This is PaperStudio's killer feature, designed for batch tasks:

* **Excel Data Source**: Supports importing `.xlsx` files, auto-detects headers.
* **Data Binding**: Bind text, barcodes, and images on the canvas to Excel fields.
* **Batch Generation**: Design one template, automatically generate hundreds or thousands of pages with different content (e.g., batch print employee badges with different names and photos).
* **Smart Serial Numbers**: Supports auto-generating incrementing/decrementing serial numbers.

### 3. 🛠️ Professional Visual Editor

Canvas built on Fabric.js, providing near-desktop software operation experience:

* **Complete Layer Management**: Supports layer locking, hiding, sorting.
* **WYSIWYG Tables**: Built-in powerful table editor supporting cell merging, splitting, style customization.
* **Vector Drawing**: Rectangles, circles, polygons, lines, and smart corner settings.
* **Barcode/QR Code Generation**: Supports 30+ mainstream barcode formats including QR Code, Code128, EAN-13, with dynamic content binding.

### 4. 🖨️ Flexible Output & Printing

* **Export PDF**: Based on jsPDF, supports multi-page batch export with vector-level clarity.
* **Native Printing**: Directly calls browser print interface, supports print preview.
* **Local Font Support**: Directly calls fonts installed on the user's computer (no upload needed).

### 5. 🔒 Security & Privacy

* **Pure Frontend**: All data processing (including Excel parsing, image rendering) is done locally in the browser.
* **Data Never Leaves**: Your designs and business data are not uploaded to any server, completely safe.

---

## 💡 Application Scenarios

* **Education/Training**: Customize practice sheets, letterhead, music manuscript creation.
* **Administrative Office**: Batch print employee badges, meeting table cards, fixed asset labels.
* **Warehousing/Logistics**: Generate product labels with barcodes/QR codes, shipping documents.
* **Personal Use**: Make journal pages, calendars, to-do lists.

---

## 💻 Tech Stack

* **Core Engine**: [Fabric.js](http://fabricjs.com/) (Canvas interaction)
* **Style Framework**: TailwindCSS (UI building)
* **PDF Generation**: jsPDF & svg2pdf
* **Data Processing**: SheetJS (Excel parsing)
* **Barcode Generation**: bwip-js
* **Font Processing**: Opentype.js (font parsing)

---

## ⚡ Quick Start

1. Open `index.html` (Chrome or Edge browser recommended).
2. Click **"New Blank Paper"** or select a preset from the template library.
3. **Design**: Add text, shapes, or tables from the top toolbar.
4. **Data Binding (Optional)**: Switch to the "Data Source" panel, load a local Excel file, select an element and bind a field in the properties panel.
5. **Output**: Click "Print" or "Export PDF" in the top right corner.



## ⌨️ Keyboard Shortcuts

| Key Combination | Function | Notes |
| :--- | :--- | :--- |
| `Ctrl` + `C` | Copy | Copy elements on canvas |
| `Ctrl` + `V` | Paste | Paste to canvas |
| `Ctrl` + `Z` | Undo | Undo last action |
| `Ctrl` + `Y` | Redo | Redo last action |
| `Ctrl` + `S` | Save | Save as .paper project file |
| `Ctrl` + `O` | Open | Open .paper project file |
| `Ctrl` + `P` | Print | Call browser print |
| `Delete` | Delete | Delete selected elements |
| `Alt` + Drag | Pan canvas | Grab mode |
| `Shift` + Click | Multi-select | Select multiple elements |
| Arrow Keys (`↑` `↓` `←` `→`) | Nudge | Move 2px each time |

## 🤝 Contributing

Welcome to submit Issues or Pull Requests!

1. Fork this repository.
2. Create a Feat_xxx branch.
3. Submit code.
4. Create a Pull Request.

## 📄 License

This project is open source under the [MIT License](LICENSE). You can use it for personal or commercial purposes for free, but please retain the original author's copyright notice.
