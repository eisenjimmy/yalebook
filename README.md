# Yalebook - Premium PDF Magazine Viewer

A high-fidelity, interactive PDF flipbook viewer designed for a premium reading experience. It combines realistic page-turning physics with modern web design aesthetics (Glassmorphism, Dark Mode) and robust navigation controls.

## 🌟 Key Features

### 📖 Realistic Reading Experience
- **Physics-Based Page Flip**: Powered by `StPageFlip`, offering realistic page curl, shadow, and flip animations.
- **Double-Page Spread**: Automatically rendering two pages side-by-side on desktop for a magazine-like feel.
- **Dynamic Shadows**: Real-time shadow generation during drags to enhance depth.

### 🎮 Advanced Navigation & Interaction
- **Smart Zoom & Pan**:
    - **Mouse Wheel**: Smooth zoom in/out centered on cursor.
    - **Right-Click Drag**: Intuitive panning (Grab & Drag) similar to professional design software.
    - **Context Menu Suppression**: Browser context menu overrides to prevent interruptions.
- **Consistent Controls**: Custom toolbar with floating navigation buttons.
- **Mobile Optimized**: Touch-friendly interface with responsive layout adjustments.

### 🎨 Premium UI/UX
- **Glassmorphism Design**: Translucent, blurred UI elements (`backdrop-filter`) for a modern look.
- **Adaptive Cursor**: Context-aware `grab` and `grabbing` cursors for clear interaction feedback.
- **Dark Themed**: Aesthetic wooden table background with dynamic lighting effects.

## 🛠️ Technology Stack

- **Core**: HTML5, Vanilla JavaScript, Tailwind CSS (v3 via CDN).
- **PDF Rendering**: `Mozilla PDF.js` (v3.11).
- **Page Flip Engine**: `StPageFlip` (v2.0.7).
- **Fonts**: Google Fonts (Inter).

## 🚀 Recent Updates & Fixes

- **Drag Rendering Engine**: Fixed a critical artifact where pages would render out-of-flow during drag operations.
- **Positioning Logic**: Enforced absolute positioning for physics elements to prevent CSS conflicts.
- **Performance**: Added `preRenderAllPages` logic to ensure seamless page transitions without white flashes.
- **Interaction**: Decoupled "Pan" from "Flip" to prevent accidental page turns while navigating zoomed content.

## 📦 Setup & Usage

1.  **Clone/Download** the repository.
2.  **Serve** the directory using a local web server (required for CORS/PDF.js worker).
    ```bash
    # Python 3
    python -m http.server 8080
    
    # Node.js (http-server)
    npx http-server .
    ```
3.  **Open** your browser to `http://localhost:8080`.
4.  **Upload** a PDF file or view the default sample.