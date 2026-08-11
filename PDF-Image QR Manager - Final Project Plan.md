# PDF/Image QR Manager - Final Project Plan

## Overview

Build a React application that allows users to manage PDFs and images, automatically generate QR codes, and host files on GitHub Pages without exposing the actual GitHub file URLs.

The QR Code **must never point directly to GitHub**.

Instead, every QR Code should point to a React viewer page.

Example:

```text
QR Code
      │
      ▼
https://username.github.io/pdf-manager/view/manual-001
```

The React application loads `data.json`, finds the file by ID, and displays the PDF or image directly inside the browser.

This allows the GitHub storage structure to change later without requiring new QR codes.

---

# Goals

- React application only
- No backend
- No database
- No AWS
- No monthly hosting cost
- GitHub Pages hosts static assets
- QR codes never expose GitHub URLs
- Support both PDFs and images
- Automatically generate metadata
- Automatically generate QR Codes
- Browser viewer only (never force file download)

---

# Technology

- React
- Vite
- TypeScript
- React Router
- react-qr-code
- GitHub REST API
- GitHub Pages
- File System Access API

---

# Architecture

```
React Admin
      │
      ▼
Select Folder
      │
      ▼
Read all Files
      │
      ▼
Upload Files
      │
      ▼
GitHub Pages

      │

Generate data.json

      │

React Viewer

      │

QR Code

      │

Mobile Browser
```

---

# Supported File Types

Initially support:

- PDF
- PNG
- JPG
- JPEG
- WEBP

The architecture should allow future support for additional file types.

---

# Repository Structure

```
pdf-storage/

pdfs/
images/

data.json

README.md
```

Example

```
pdf-storage/

pdfs/
    Manual.pdf
    Warranty.pdf

images/
    Front.jpg
    Back.png

data.json
```

---

# React Application Structure

```
src/

pages/
    Dashboard
    Viewer
    Settings

components/
    FileTable
    QRDialog
    UploadProgress
    SearchBar

services/
    github
    jsonGenerator

utils/
    upload
    fileReader
```

---

# Folder Selection

User clicks

```
Select Folder
```

Choose

```
Documents/

Manual.pdf
Warranty.pdf
Front.jpg
Back.png
```

Application automatically detects every supported file.

No manual file selection.

---

# Upload Flow

When user clicks

```
Upload
```

For every file

1. Detect file type.
2. Upload to GitHub repository.
3. Generate metadata.
4. Build viewer URL.
5. Generate QR code.
6. Add entry to memory.

After all uploads complete

Generate `data.json`.

Upload `data.json` to GitHub.

---

# data.json Format

```json
[
  {
    "id": "manual-001",
    "name": "Product Manual",
    "fileName": "Manual.pdf",
    "type": "pdf",
    "path": "pdfs/Manual.pdf"
  },
  {
    "id": "front-label",
    "name": "Front Label",
    "fileName": "Front.jpg",
    "type": "image",
    "path": "images/Front.jpg"
  }
]
```

Notice that the JSON stores only the repository path.

The viewer constructs the actual GitHub Pages URL internally.

---

# QR Code Generation

QR Codes should contain **only the React Viewer URL**.

Example

```
https://username.github.io/pdf-manager/view/manual-001
```

Never generate QR codes pointing directly to GitHub Pages.

---

# Viewer Route

```
/view/:id
```

Example

```
/view/manual-001
```

Flow

1. Read `id` from URL.
2. Load `data.json`.
3. Find matching record.
4. Construct GitHub Pages asset URL from the stored path.
5. Display the file.

---

# Viewer Behaviour

## PDF

Display inside browser.

Use

- iframe
- embed

Never force download.

The PDF should open exactly like an online document viewer.

---

## Image

Display using a responsive image viewer.

No download prompt.

---

# Dashboard

Display

- Search
- Upload Button
- Refresh Metadata
- Settings

Table Columns

- File Name
- File Type
- Status
- View
- QR Code
- Copy Viewer URL

---

# QR Dialog

Every row has

```
Show QR
```

Modal displays

- QR Code
- Viewer URL
- Copy URL
- Download QR PNG
- Print QR

The QR image is generated dynamically.

QR images are **not stored** in GitHub.

---

# Settings Page

User enters once

- GitHub Username
- Repository Name
- Branch
- Personal Access Token
- GitHub Pages Base URL
- React App Base URL

Store in browser Local Storage.

---

# Search

Support searching by

- Name
- File Name
- Type

Realtime filtering.

---

# Upload Progress

Show

```
Uploading

125 / 2000
```

Progress bar required.

---

# Duplicate Handling

If a file already exists

Show options

- Skip
- Replace
- Rename

---

# Performance

Must support

- 2,000+ files
- Virtualized table
- Lazy rendering
- Concurrent uploads (5–10 files)
- Retry failed uploads
- Responsive UI

---

# Security

- Never expose the GitHub Pages file URL in the QR code.
- Never bundle PDFs or images into the React application.
- Only `data.json` is loaded on startup.
- Files are fetched only when a viewer page is opened.
- Keep the GitHub Personal Access Token only in browser Local Storage and never include it in the deployed application.

---

# Future Enhancements

- ZIP export of QR codes
- Printable QR sheets (A4)
- Bulk delete
- Bulk rename
- Drag-and-drop folder upload
- Categories
- Tags
- File statistics
- Image gallery mode

---

# Final Workflow

```
User selects folder
        │
        ▼
React reads all PDFs & Images
        │
        ▼
Upload files to GitHub
        │
        ▼
Generate data.json
        │
        ▼
Upload data.json
        │
        ▼
Generate QR codes dynamically
        │
        ▼
User prints QR codes
        │
        ▼
Customer scans QR
        │
        ▼
React Viewer opens
        │
        ▼
Viewer loads data.json
        │
        ▼
Viewer finds file
        │
        ▼
Viewer displays PDF or image inside the browser
```

## Important Rules

1. No backend server.
2. No database.
3. No AWS or other cloud storage.
4. GitHub Pages is the only file host.
5. QR codes must always point to the React Viewer route, never directly to GitHub.
6. PDFs and images must open inside the browser whenever supported, never trigger a forced download.
7. React must only load `data.json` initially; assets are fetched on demand.
8. The codebase should be modular, scalable, production-ready, and easy to extend with additional file types in the future.