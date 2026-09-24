# Joes Studio

Joes Studio is a browser-based visual paper and document design tool. It supports editable templates, text and image elements, tables, barcodes, variable data from Excel files, PDF export, and direct printing.

## Features

- Visual drag-and-drop editor
- Editable `.paper` project files and templates
- Text, images, tables, shapes, barcodes and QR codes
- Excel `.xlsx` / `.xls` data import and variable fields
- Batch generation and printing
- PDF export
- Local browser storage and offline-first operation
- Standard paper sizes and custom layouts

## Usage

Open `index.html` in a modern browser, or deploy the repository with GitHub Pages.

**Brand:** Joes Studio

## Student Card Batch Workflow

Joes Studio includes a dedicated **Student Batch** workflow for generating many cards from one master template.

1. Create or obtain a card template as a `.paper` file (for example, a card design produced from a reference image).
2. Open **Student Batch** and select the `.paper` template from the local PC.
3. Select the student `.xlsx`, `.xls`, or `.csv` file.
4. Joes Studio reads the student rows and automatically maps matching variable fields to spreadsheet headers.
5. Choose the print sheet size, margins, gaps, and copies per student.
6. The layout calculator determines how many cards fit on each sheet.
7. Generate one print-ready PDF containing the complete student batch.

The workflow keeps the template and student data in the browser session and only reads files explicitly selected by the user. Browser file access is permission-based rather than unrestricted filesystem access.
