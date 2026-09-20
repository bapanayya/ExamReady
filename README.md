# ExamReady - Competitive Exam Image & Document Toolkit 🎯

[![Test Suite](https://img.shields.io/badge/tests-passing-brightgreen.svg)](tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Android-orange.svg)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20On--Device-success.svg)](#)

> **Privacy-First Competitive Exam Image & Document Preparation Toolkit for Web and Android.**  
> Automatically crop, resize, compress, enhance, and validate photographs, signatures, thumb impressions, handwritten declarations, and certificate PDFs to match official exam upload notifications.

---

## 🔒 100% Privacy-First Architecture

Unlike commercial image resizing portals that upload personal photos, signatures, and ID documents to third-party web servers, **ExamReady processes everything 100% on the user's device** using HTML5 Canvas, Web Workers, and local binary compression algorithms.
- **Zero server uploads**
- **Zero cloud storage**
- **Zero tracking or data collection**
- **Full offline support via PWA & Native Android shell**

---

## 🚀 Key Features

| Feature | Description |
|---|---|
| **📸 Passport Photo Studio** | Automatically applies exact dimensions (e.g. 200×230 px, 350×450 px) and compresses file size strictly into the official KB range (e.g. 20–50 KB). |
| **📅 Name & Date of Photo (DOP)** | Generates official bottom white banner with candidate name and photo date as mandated by UPSC, SSC, and state exams. |
| **✍️ Signature Ink & Shadow Cleaner** | Removes desk shadows, creases, and yellowish paper from mobile camera photos, yielding crisp ink on pure white background. |
| **👆 Thumb Impression Enhancer** | Sharpens delicate ridge patterns and boosts contrast to avoid biometric rejection. |
| **📝 Handwritten Declaration Tool** | Previews official declaration text templates alongside image preparation. |
| **📄 Certificate to PDF Engine** | Converts single or multiple camera photos into standard A4 PDF files strictly under required size limits (e.g., under 300 KB / 500 KB). |
| **✅ Real-Time Validation Engine** | Granular inspection table showing Format, Width × Height, File Size (KB), and Aspect Ratio with instant PASS / FAIL feedback. |

---

## 🏛️ Supported Examination Specifications

The database (`core/exams.json`) comes pre-loaded with verified guidelines for:
- **Banking & Insurance**: IBPS PO, IBPS Clerk, IBPS RRB, SBI PO, SBI Clerk, RBI Grade B
- **Staff Selection Commission (SSC)**: SSC CGL, SSC CHSL, SSC GD Constable, SSC MTS, SSC CPO
- **Civil Services & Defence**: UPSC Civil Services (CSE / IAS / IPS), UPSC CDS, UPSC NDA
- **Railways (RRB)**: RRB NTPC, RRB ALP, RRB Group D
- **National Entrance (NTA)**: NEET UG, JEE Main, CUET UG, GATE
- **State PSCs**: UPPSC PCS, BPSC CCE, and expandable custom state boards
- **Custom Mode**: Freeform custom manual input for any unlisted recruitment portal

---

## 📁 Repository Structure

```
├── core/                               # Shared processing engine & data
│   ├── exams.json                      # Exam specifications database
│   ├── categories.json                 # Sector category definitions
│   ├── validator.js                    # Core validation rules engine
│   ├── compressor.js                   # Binary search iterative compression
│   ├── image-processor.js              # Canvas operations, DOP stamp & filters
│   └── pdf-builder.js                  # Client-side image-to-PDF generator
│
├── web/                                # Modern Responsive Web Application & PWA
│   ├── index.html                      # Single Page Application
│   ├── manifest.json                   # Web App Manifest for mobile installation
│   ├── sw.js                           # Service Worker for 100% offline capability
│   ├── css/styles.css                  # Mobile-first responsive UI & themes
│   ├── js/app.js                       # Main application state & UI coordinator
│   └── assets/icons/                   # Vector and PWA icons
│
├── android/                            # Android Studio / Capacitor Project
│   ├── app/src/main/AndroidManifest.xml
│   ├── app/build.gradle
│   └── ...
│
├── tests/                              # Automated Unit Test Suite
│   ├── exams-schema.test.js            # Schema validation
│   ├── validator.test.js               # Validation rules
│   └── compressor.test.js              # Iterative convergence tests
│
├── scripts/
│   └── serve.js                        # Zero-dependency local dev server
│
├── .github/workflows/
│   ├── deploy.yml                      # Automatic GitHub Pages deployment
│   └── android-build.yml               # Automatic Android APK build CI
│
└── package.json
```

---

## 🛠️ Quick Start & Local Development

### 1. Run Automated Tests
```bash
node tests/exams-schema.test.js
node tests/validator.test.js
node tests/compressor.test.js
```

### 2. Start Local Development Server
```bash
node scripts/serve.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📱 Running on Android

### Option A: Direct PWA Install (No build required)
1. Open the hosted web application in Chrome on any Android smartphone.
2. Tap the browser menu (⋮) -> **"Add to Home screen"** or **"Install App"**.
3. ExamReady will install as a standalone app with its own app icon, offline support, and full camera/gallery access.

### Option B: Pre-built APK via GitHub Actions
- Every push to `main` or tagged release automatically triggers `.github/workflows/android-build.yml`.
- Go to the **Actions** tab on your GitHub repository and download the generated `ExamReady-Debug-APK` artifact.

### Option C: Local Android Studio Build
```bash
npx @capacitor/cli sync android
npx @capacitor/cli open android
```
Click **Run** or **Build APK** inside Android Studio.

---

## 🌐 Deploying to GitHub Pages

1. Push the code to your GitHub repository `main` branch.
2. In GitHub repository settings -> **Pages** -> Source: select **GitHub Actions**.
3. The included `.github/workflows/deploy.yml` will automatically validate and deploy the live site.

---

## 📄 License
This project is open source and available under the [MIT License](LICENSE).
