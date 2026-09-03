# 📄 Joe's Studio - Simple and Easy Paper Print Design Tool

**Joe's Studio** is a web-based, lightweight, and powerful visual print design tool. It requires no installation—just open it in your browser. Besides supporting the design of various standard office paper and calligraphy practice paper, it also includes a powerful **Variable Data** feature. By importing Excel data, you can easily achieve batch generation and printing of labels, certificates, badges, payroll slips, and more.

---

## ✨ Key Highlights

### 1. 🎨 Rich Paper Template Library

Built-in multiple preset templates to meet different scenario needs, with parameterized one-click adjustment:

* **Common Sizes**: A3, A4, A5, B4, B5 standard sizes and custom sizes.
* **Office/Learning**: Lined paper, grid paper, English paper, music staff paper.
* **Calligraphy/Traditional Style**: Tian-zi grid, Mi-zi grid, Hui-zi grid, Jiu-gong grid (supports custom colors, dashed lines).
* **Geometric Shapes**: Dot grid, triangle grid, hexagon grid.

### 2. 🚀 Powerful Variable Data Printing

This is Joe's Studio's killer feature, designed specifically for batch tasks:

* **Excel Data Source**: Supports importing `.xlsx` files with automatic header recognition.
* **Data Binding**: Bind text, barcodes, and images on the canvas to Excel fields.
* **Batch Generation**: Design one template to automatically generate hundreds or thousands of pages with different content (e.g., batch print badges with different names and photos).
* **Smart Serial Numbers**: Supports automatically generating incrementing/decrementing serial numbers.

### 3. 🛠️ Professional Visual Editor

A canvas built on Fabric.js providing an experience close to desktop software:

* **Complete Layer Management**: Supports layer locking, hiding, and sorting.
* **WYSIWYG Table Editor**: Built-in powerful table editor supporting cell merging, splitting, and style customization.
* **Vector Drawing**: Rectangles, circles, polygons, lines, and smart rounded corner settings.
* **Barcode/QR Code Generation**: Supports 30+ mainstream barcode formats like QR Code, Code128, EAN-13, with dynamically bindable content.

### 4. 🖨️ Flexible Output and Printing

* **Export PDF**: Based on jsPDF, supports multi-page batch export with vector-level clarity.
* **Native Printing**: Directly calls the browser print interface with print preview support.
* **Local Font Support**: Directly calls fonts installed on the user's computer (no upload needed).

### 5. 🔒 Security and Privacy

* **Pure Frontend Operation**: All data processing (including Excel parsing, image rendering) is done locally in the browser.
* **Data Never Leaves**: Your designs and business data are never uploaded to any server, absolutely safe.

---

## 💡 Application Scenarios

* **Education/Training**: Customize handwriting practice sheets, letterhead paper, music staff creation.
* **Administrative Office**: Batch print employee badges, meeting table cards, fixed asset labels.
* **Warehousing/Logistics**: Generate product labels with barcodes/QR codes, shipping documents.
* **Personal Use**: Make journal inner pages, calendars, to-do lists.

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
2. Click **"New Blank Paper"** or choose a preset from the template library.
3. **Design**: Add text, shapes, or tables from the top toolbar.
4. **Data Binding (optional)**: Switch to the "Data Source" panel, load a local Excel file, select an element and bind the field in the properties panel.
5. **Output**: Click "Print" or "Export PDF" in the upper right corner.



## ⌨️ Keyboard Shortcuts

| Key Combination | Function | Notes |
| :--- | :--- | :--- |
| `Ctrl` + `C` | Copy | Copy elements on canvas |
| `Ctrl` + `V` | Paste | Paste to canvas |
| `Ctrl` + `Z` | Undo | Undo last operation |
| `Ctrl` + `Y` | Redo | Redo last undone operation |
| `Ctrl` + `S` | Save | Save as .paper project file |
| `Ctrl` + `O` | Open | Open .paper project file |
| `Ctrl` + `P` | Print | Call browser print |
| `Delete` | Delete | Delete selected elements |
| `Alt` + Drag | Pan canvas | Grab mode |
| `Shift` + Click | Multi-select | Select multiple elements |
| Arrow Keys (`↑` `↓` `←` `→`) | Nudge | Move 2px each time |

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this repository.
2. Create a Feat_xxx branch.
3. Commit your code.
4. Create a Pull Request.

## 📄 License

This project is open source under the [MIT License](LICENSE). You can use it free of charge for personal or commercial purposes, but please retain the original author's copyright notice.
