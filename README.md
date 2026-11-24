
https://manavsolanki344-gif.github.io/photo-print-studio-pro/

# 📸 Photo Print Studio Pro

A professional, production-ready web application for local colour-printing and photo-printing shops. Create passport-size photographs, crop Aadhaar / ID cards, and generate high-quality print-ready sheets — all running **100% inside your browser**.

> **No server. No upload. No account.** Every operation happens locally on your computer. Aadhaar cards and personal photos never leave your device.

---

## ✨ Features

### 🪪 Passport Photo Maker
- Upload any portrait photograph (JPG, PNG, WebP)
- Crop to **35×45 mm** (India/ICAO), **2×2 in** (US), or any custom size
- Brightness, contrast, saturation adjustments
- Generate **1 to 12 identical copies** arranged on one glossy sheet
- **Photo border ON/OFF** toggle — adds cut-line borders around each photo
- Paper size: **4×5 in** or **4×6 in** glossy
- Export at **300 / 450 / 600 / 900 DPI**

### 🆔 ID Card Cropper (Aadhaar / PAN / Voter ID)
- Upload a **PDF** or **image scan** of any ID card
- **Full-page viewer** — the entire document fills the screen
- Draw **FRONT** selection (blue) and **BACK** selection (amber) — both visible simultaneously
- Confirm both → generates stacked layout:
  - **Front on top**
  - **Cut line in the middle**
  - **Back on bottom**
- Download as **4×6 in (10×15 cm)** or **4×5 in (10×12.7 cm)** portrait
- Export: **JPG / PNG / PDF** with real DPI metadata
- Print at actual size directly from the browser

### 🖨️ Print Sheet Editors (4×5 / 4×6 / Custom)
- Interactive canvas editor with **drag, resize, rotate** support
- **Rulers** and **alignment snap guides**
- Auto-arrange: 1, 2, 4, 6, 8, 10, 12 photos with equal spacing
- Safe margins and cutting guides
- **Undo / Redo** (Ctrl+Z / Ctrl+Y)
- Export the exact paper size as JPG, PNG, or print-ready PDF

### 📐 Accurate Physical Dimensions

| Paper | Inches | Centimetres | 300 DPI | 600 DPI |
|-------|--------|-------------|---------|---------|
| 4×5 | 5.00 × 4.00 | 12.7 × 10.2 | 1500 × 1200 | 3000 × 2400 |
| 4×6 | 6.00 × 4.00 | 15.2 × 10.2 | 1800 × 1200 | 3600 × 2400 |

For stacked ID cards (portrait):

| Paper | Inches | Centimetres | 300 DPI |
|-------|--------|-------------|---------|
| 4×6 portrait | 4 × 6 | **10 × 15 cm** | 1200 × 1800 |
| 4×5 portrait | 4 × 5 | **10 × 12.7 cm** | 1200 × 1500 |

---

## 🖥️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **Vite 7** | Build tool |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Styling |
| **PDF.js** | PDF rendering in browser |
| **jsPDF** | PDF generation |
| **HTML5 Canvas** | Image processing & rendering |
| **IndexedDB** | Local project storage |
| **Lucide React** | Icons |

---

## 🔒 Privacy & Security

- ✅ **100% client-side** — no backend, no server, no cloud
- ✅ Photos and Aadhaar documents are **never uploaded** anywhere
- ✅ Works **offline** after initial load
- ✅ No login, no account, no tracking, no analytics
- ✅ Object URLs are revoked when images are removed
- ✅ Deployable as a **static site** (GitHub Pages, Netlify, Vercel)

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** installed
- **npm** (comes with Node.js)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/photo-print-studio-pro.git
cd photo-print-studio-pro

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

The production build creates a single `dist/index.html` file with everything inlined.

---

## 📋 How to Use

### Workflow A — Passport Photos
1. Open **Passport Photo Maker**
2. Upload a portrait photo
3. Adjust the crop box to frame the face
4. Choose photo size (35×45 mm, 2×2 in, etc.)
5. Set number of copies (e.g. 8)
6. Toggle **Photo border ON** if you want cutting borders
7. Click **Generate 8 Copies**
8. Download as **JPG** or **PNG** at your chosen DPI

### Workflow B — Aadhaar / ID Card
1. Open **ID Card Cropper**
2. Upload PDF or image of the ID card
3. Draw a **blue rectangle** around the FRONT side
4. App auto-switches to BACK — draw an **amber rectangle** around the back side
5. Click **Confirm Both**
6. Download stacked layout on **4×6 (10×15 cm)** as JPG or PNG
7. Print at actual size on glossy paper

### Workflow C — Custom Print Sheet
1. Open **4×5**, **4×6**, or **Custom Print Layout**
2. Upload multiple photos
3. Drag, resize, rotate freely on the canvas
4. Use auto-arrange for quick layouts
5. Export at 300–900 DPI

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + S` | Save project locally |
| `Ctrl + P` | Print |
| `Ctrl + D` | Duplicate selected object |
| `Delete` | Remove selected object |
| `Arrow keys` | Nudge selection |
| `Shift + Arrow` | Nudge by 0.1 inch |
| `Shift + drag` | Resize keeping proportions |

---

## 🌐 Deployment

### GitHub Pages (recommended)
The repository includes `.github/workflows/deploy.yml` that automatically builds and deploys to GitHub Pages on every push to `main`.

1. Push to GitHub
2. Go to **Settings → Pages → Source → GitHub Actions**
3. Wait for deployment
4. Live at: `https://YOUR_USERNAME.github.io/photo-print-studio-pro/`

### Netlify
1. Connect your GitHub repository
2. Build command: `npm run build`
3. Publish directory: `dist`

### Vercel
1. Import from GitHub
2. Framework: Vite
3. Build command: `npm run build`
4. Output directory: `dist`

---

## 📁 Project Structure

```
photo-print-studio-pro/
├── .github/workflows/deploy.yml    # GitHub Pages auto-deploy
├── src/
│   ├── App.tsx                     # Main app shell + routing
│   ├── main.tsx                    # Entry point
│   ├── index.css                   # Tailwind + custom theme
│   ├── vite-env.d.ts               # Vite type declarations
│   ├── assets/                     # Generated images
│   ├── components/
│   │   ├── Sidebar.tsx             # Navigation sidebar
│   │   └── ui.tsx                  # Reusable UI components
│   ├── lib/
│   │   ├── types.ts                # TypeScript interfaces
│   │   ├── paper.ts                # Paper sizes, DPI calculations
│   │   ├── images.ts               # Image processing utilities
│   │   ├── sheet.ts                # Sheet rendering & export engine
│   │   ├── studio.tsx              # App context provider
│   │   └── db.ts                   # IndexedDB storage
│   └── modules/
│       ├── Dashboard.tsx           # Home dashboard
│       ├── PassportMaker.tsx       # Passport photo editor
│       ├── IdCropper.tsx           # ID card cropper + PDF viewer
│       ├── SheetEditor.tsx         # Print sheet canvas editor
│       ├── Projects.tsx            # Saved projects manager
│       └── Settings.tsx            # App settings
├── index.html                      # HTML entry
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
└── README.md
```

---

## 🛠️ DPI & Export Details

- **JPG exports** include JFIF density header with correct DPI
- **PNG exports** include pHYs chunk with correct DPI
- **PDF pages** are set to exact physical paper dimensions (inches)
- Output pixel dimensions are calculated as: `width_inches × DPI`
- Memory guard prevents browser crashes on oversized canvases
- Always set your printer to **100% / Actual Size** (no scaling)

---

## 📄 License

This project is for personal and commercial use in photo printing shops.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m "Add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

**Made for real photo printing shops.** 🏪📷
