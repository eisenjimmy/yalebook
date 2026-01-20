/**
 * PDF Magazine Viewer
 * A beautiful PDF viewer with realistic page flip effects
 */

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// App State
const state = {
    pdfDoc: null,
    pageFlip: null,
    currentPage: 1,
    totalPages: 0,
    isDoublePageMode: true,
    isMobile: false,
    zoom: 1,
    minZoom: 0.5,
    maxZoom: 3,
    pageCache: new Map(),
    searchResults: [],
    currentSearchIndex: -1,
    currentSearchQuery: '',
    pageTexts: new Map(),
    isFullscreen: false,
    basePageWidth: 400,
    basePageHeight: 560,
    panX: 0,
    panY: 0,
};

// Mobile breakpoint
const MOBILE_BREAKPOINT = 768;

// DOM Elements
const elements = {
    uploadScreen: document.getElementById('upload-screen'),
    viewerContainer: document.getElementById('viewer-container'),
    pdfUpload: document.getElementById('pdf-upload'),
    flipbook: document.getElementById('flipbook'),
    creaseOverlay: document.getElementById('crease-overlay'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),

    // Toolbar
    btnPrev: document.getElementById('btn-prev-float'),
    btnNext: document.getElementById('btn-next-float'),
    pageInput: document.getElementById('page-input'),
    totalPages: document.getElementById('total-pages'),
    searchInput: document.getElementById('search-input'),
    btnSearchPrev: document.getElementById('btn-search-prev'),
    btnSearchNext: document.getElementById('btn-search-next'),
    searchResults: document.getElementById('search-results'),
    btnViewMode: document.getElementById('btn-view-mode'),
    iconSingle: document.getElementById('icon-single'),
    iconDouble: document.getElementById('icon-double'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnShare: document.getElementById('btn-share'),
    btnFullscreen: document.getElementById('btn-fullscreen'),

    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
};

// ============================================
// Initialization
// ============================================

function init() {
    setupEventListeners();
    checkUrlForPdf();
    checkMobileMode();
    // Auto-load the PDF from book folder
    loadPdfFromUrl('book/book.pdf');

    // Setup Zoom and Pan Controls (Global)
    setupZoomPanControls();
    setupMobileControls(); // Init mobile UI
}

function checkMobileMode() {
    const wasMobile = state.isMobile;
    state.isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    // Force single-page mode on mobile
    if (state.isMobile && state.isDoublePageMode) {
        state.isDoublePageMode = false;
        // Update icons
        if (elements.iconSingle && elements.iconDouble) {
            elements.iconSingle.classList.remove('hidden');
            elements.iconDouble.classList.add('hidden');
        }
        // Update flipbook class for styling
        if (elements.flipbook) {
            elements.flipbook.classList.add('single-mode');
        }
    }

    return wasMobile !== state.isMobile;
}

async function loadPdfFromUrl(url) {
    showLoading('PDF 로딩 중...');

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load PDF');

        const arrayBuffer = await response.arrayBuffer();
        state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        state.totalPages = state.pdfDoc.numPages;

        // Update UI
        elements.totalPages.textContent = state.totalPages;
        elements.pageInput.max = state.totalPages;

        // Extract text for search
        showLoading('페이지 준비 중...');
        await extractAllPageTexts();

        // Show viewer BEFORE initializing flipbook so it can measure dimensions
        elements.uploadScreen.classList.add('hidden');
        elements.viewerContainer.classList.remove('hidden');

        // Wait for the DOM to update and have proper dimensions
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 100);
            });
        });

        // Initialize flipbook
        await initFlipbook();

        // Pre-render all pages to ensure smooth flipping
        showLoading('페이지 렌더링 중...');
        await preRenderAllPages();

        // Update crease visibility
        updateCreaseVisibility();
        updateFlipGuides();

        hideLoading();

    } catch (error) {
        console.error('Error loading PDF:', error);
        hideLoading();
        showToast('PDF 로딩 오류.');
    }
}

function setupEventListeners() {
    // File Upload
    elements.pdfUpload.addEventListener('change', handleFileUpload);

    // Drag and Drop
    const uploadContainer = document.querySelector('.upload-container');
    uploadContainer.addEventListener('dragover', handleDragOver);
    uploadContainer.addEventListener('dragleave', handleDragLeave);
    uploadContainer.addEventListener('drop', handleDrop);

    // Navigation
    elements.btnPrev.addEventListener('click', goToPrevPage);
    elements.btnNext.addEventListener('click', goToNextPage);

    elements.pageInput.addEventListener('change', handlePageInputChange);
    elements.pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlePageInputChange();
    });

    // Search
    elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                goToPrevSearchResult();
            } else {
                goToNextSearchResult();
            }
        }
    });
    elements.btnSearchPrev.addEventListener('click', goToPrevSearchResult);
    elements.btnSearchNext.addEventListener('click', goToNextSearchResult);

    // View Mode
    elements.btnViewMode.addEventListener('click', toggleViewMode);

    // Zoom
    elements.btnZoomIn.addEventListener('click', zoomIn);
    elements.btnZoomOut.addEventListener('click', zoomOut);

    // Share
    elements.btnShare.addEventListener('click', shareLink);

    // Fullscreen
    elements.btnFullscreen.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', handleFullscreenChange);


    // Keyboard Navigation
    document.addEventListener('keydown', handleKeydown);

    // Window Resize
    window.addEventListener('resize', debounce(handleResize, 200));

    // Prevent right-click from triggering page flip
    elements.flipbook.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

function checkUrlForPdf() {
    // Check if there's a page number in the URL hash
    const hash = window.location.hash;
    if (hash.startsWith('#page=')) {
        state.currentPage = parseInt(hash.split('=')[1]) || 1;
    }
}

// ============================================
// File Handling
// ============================================

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        loadPdf(file);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadPdf(file);
    }
}

// ============================================
// PDF Loading & Rendering
// ============================================

async function loadPdf(file) {
    showLoading('Loading PDF...');

    try {
        const arrayBuffer = await file.arrayBuffer();
        state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        state.totalPages = state.pdfDoc.numPages;

        // Update UI
        elements.totalPages.textContent = state.totalPages;
        elements.pageInput.max = state.totalPages;

        // Extract text for search
        showLoading('Preparing pages...');
        await extractAllPageTexts();

        // Initialize flipbook
        await initFlipbook();

        // Pre-render all pages to ensure smooth flipping
        showLoading('Rendering pages...');
        await preRenderAllPages();

        // Show viewer
        elements.uploadScreen.classList.add('hidden');
        elements.viewerContainer.classList.remove('hidden');

        // Update crease visibility
        updateCreaseVisibility();

        hideLoading();

    } catch (error) {
        console.error('Error loading PDF:', error);
        hideLoading();
        showToast('Error loading PDF. Please try another file.');
    }
}

async function renderPage(pageNum, width, height) {
    // Check cache
    const cacheKey = `${pageNum}-${width}-${height}`;
    if (state.pageCache.has(cacheKey)) {
        return state.pageCache.get(cacheKey);
    }

    try {
        const page = await state.pdfDoc.getPage(pageNum);

        // Get PDF's native viewport
        const nativeViewport = page.getViewport({ scale: 1 });

        // Calculate scale to fit the target dimensions
        const fitScale = Math.min(width / nativeViewport.width, height / nativeViewport.height);

        // Render at native PDF scale x 2 for highest quality
        // This ensures crisp text regardless of display size
        const renderScale = 2 * fitScale;

        const renderViewport = page.getViewport({ scale: renderScale });

        // Create canvas at render resolution
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', {
            alpha: false,  // Disable alpha for better performance
            desynchronized: true,  // Better rendering performance
        });
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;

        // Enable high-quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Render with highest quality settings
        await page.render({
            canvasContext: ctx,
            viewport: renderViewport,
            intent: 'display',
            renderInteractiveForms: true,
        }).promise;

        // Scale canvas down via CSS to target size for crisp display
        const displayWidth = nativeViewport.width * fitScale;
        const displayHeight = nativeViewport.height * fitScale;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        // Cache the canvas
        state.pageCache.set(cacheKey, canvas);

        return canvas;

    } catch (error) {
        console.error(`Error rendering page ${pageNum}:`, error);
        return createErrorPage(width, height);
    }
}

function createErrorPage(width, height) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#999';
    ctx.font = '16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Page could not be loaded', width / 2, height / 2);
    return canvas;
}

async function extractAllPageTexts() {
    for (let i = 1; i <= state.totalPages; i++) {
        try {
            const page = await state.pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const text = textContent.items.map(item => item.str).join(' ');
            state.pageTexts.set(i, text.toLowerCase());
        } catch (error) {
            console.error(`Error extracting text from page ${i}:`, error);
            state.pageTexts.set(i, '');
        }
    }
}

// ============================================
// Flipbook Initialization
// ============================================

async function initFlipbook() {
    // Get dimensions from the main viewer container, not the immediate parent
    // This prevents the shrinking issue when toggling view modes
    const viewerContainer = document.getElementById('viewer-container');
    const toolbarHeight = 72;

    // Always use window/viewer dimensions to calculate available space
    const availableHeight = (viewerContainer ? viewerContainer.clientHeight : window.innerHeight) - toolbarHeight;
    const availableWidth = viewerContainer ? viewerContainer.clientWidth : window.innerWidth;

    // Get PDF aspect ratio from first page
    let aspectRatio = 0.714; // Fallback
    if (state.pdfDoc) {
        try {
            const page = await state.pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            aspectRatio = viewport.width / viewport.height;
        } catch (e) {
            console.error('Error getting page aspect ratio:', e);
        }
    }

    // Ensure minimum dimensions
    const maxHeight = Math.max(availableHeight, 400);
    const maxWidth = Math.max(availableWidth, 300);

    let pageWidth, pageHeight;

    // Calculate page dimensions based on view mode and aspect ratio
    if (state.isDoublePageMode) {
        // Double-page mode: 2 pages side by side
        // Try to fit height first
        pageHeight = maxHeight;
        pageWidth = pageHeight * aspectRatio;

        // If width is too wide (2 pages > available width), scale down
        if (pageWidth * 2 > maxWidth) {
            pageWidth = maxWidth / 2;
            pageHeight = pageWidth / aspectRatio;
        }
    } else {
        // Single-page mode: 1 page centered
        pageHeight = maxHeight;
        pageWidth = pageHeight * aspectRatio;

        // If width is too wide, scale down
        if (pageWidth > maxWidth) {
            pageWidth = maxWidth;
            pageHeight = pageWidth / aspectRatio;
        }
    }

    // Ensure valid dimensions (flooring to avoid subpixel rendering issues)
    pageWidth = Math.floor(pageWidth);
    pageHeight = Math.floor(pageHeight);

    state.basePageWidth = pageWidth;
    state.basePageHeight = pageHeight;

    // Set magazine container dimensions to match book exactly
    // This ensures page-underneath allows aligns perfectly with the pages
    const magazineContainer = document.getElementById('magazine-container');
    if (magazineContainer) {
        const totalWidth = state.isDoublePageMode ? pageWidth * 2 : pageWidth;
        magazineContainer.style.width = `${totalWidth}px`;
        magazineContainer.style.height = `${pageHeight}px`;
        // Ensure accurate positioning for children (page-underneath)
        // Switch to block to avoid flex items centering behaviors interfering with absolute positioning
        magazineContainer.style.display = 'block';
    }

    // Clear existing
    elements.flipbook.innerHTML = '';

    // Create page elements
    for (let i = 1; i <= state.totalPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.dataset.pageNum = i;

        // Explicitly set size
        pageDiv.style.width = `${pageWidth}px`;
        pageDiv.style.height = `${pageHeight}px`;

        // Add cover classes for first and last pages
        if (i === 1) {
            pageDiv.classList.add('cover-page', 'cover-front');
        } else if (i === state.totalPages) {
            pageDiv.classList.add('cover-page', 'cover-back');
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'page-content';
        contentDiv.innerHTML = '<div class="loading-spinner"></div>';

        // Add backside element for single-page mode (shows mirrored content)
        if (!state.isDoublePageMode) {
            const backsideDiv = document.createElement('div');
            backsideDiv.className = 'page-backside';
            pageDiv.appendChild(backsideDiv);
        }

        pageDiv.appendChild(contentDiv);
        elements.flipbook.appendChild(pageDiv);
    }

    // Initialize StPageFlip with mode-appropriate settings
    state.pageFlip = new St.PageFlip(elements.flipbook, {
        width: pageWidth,
        height: pageHeight,
        size: 'fixed', // Use fixed size to respect our exact calculations
        minWidth: 200,
        maxWidth: pageWidth * 2, // Allow some flexibility
        minHeight: 280,
        maxHeight: pageHeight * 2,
        showCover: true, // Enable cover mode for proper magazine pagination
        mobileScrollSupport: true,
        // swipeDistance should be relative to page width
        swipeDistance: state.isDoublePageMode ? pageWidth / 2 : pageWidth / 4,
        clickEventForward: true,
        usePortrait: !state.isDoublePageMode,
        startPage: state.currentPage - 1,
        drawShadow: true,
        flippingTime: 600,
        useMouseEvents: true,
        autoSize: true,
        maxShadowOpacity: 0.4,
        showPageCorners: false,
        disableFlipByClick: false,
    });

    // Load pages
    state.pageFlip.loadFromHTML(document.querySelectorAll('.page'));

    // Event listeners
    state.pageFlip.on('flip', (e) => {
        state.currentPage = e.data + 1;
        updatePageIndicator();
        updateUrl();
        renderVisiblePages();
        updateCoverState();
        updateFlipGuides();
    });

    // Pre-render upcoming pages when flip starts and show page underneath
    state.pageFlip.on('changeState', (e) => {
        if (e.data === 'flipping' || e.data === 'user_fold' || e.data === 'fold_corner') {
            // When flipping starts, show the next page underneath
            const currentIndex = state.pageFlip.getCurrentPageIndex();

            // In double-page mode with showCover:true
            // currentIndex 0 = cover (page 1), currentIndex 1 = pages 2-3, etc.
            // The next right page would be currentIndex + 2 pages ahead
            if (state.isDoublePageMode) {
                showPageUnderneath(currentIndex);
            }

            // Pre-render up to 6 pages ahead
            const nextPages = [];
            for (let i = 1; i <= 6; i++) {
                const pageNum = currentIndex + 1 + i;
                if (pageNum >= 1 && pageNum <= state.totalPages) {
                    nextPages.push(pageNum);
                }
            }
            nextPages.forEach(pageNum => renderPageContent(pageNum));
        }

        if (e.data === 'read') {
            // Hide the underneath page when flip completes
            hidePageUnderneath();
        }
    });

    function showPageUnderneath(currentIndex) {
        // Calculate the next right-side page number
        // With showCover: true, page ordering is: [1], [2,3], [4,5], [6,7]...
        // Next right page from [2,3] would be 5, from [4,5] would be 7
        const nextRightPageNum = currentIndex * 2 + 3; // Approximation for spread layout

        if (nextRightPageNum > state.totalPages) return;

        // Find or create the underneath preview element
        let underneathEl = document.getElementById('page-underneath');
        if (!underneathEl) {
            underneathEl = document.createElement('div');
            underneathEl.id = 'page-underneath';
            underneathEl.className = 'page-underneath';
            const magazineContainer = document.getElementById('magazine-container');
            magazineContainer.appendChild(underneathEl);
        }

        // Get the next page's canvas content
        const nextPageEl = document.querySelector(`.page[data-page-num="${nextRightPageNum}"]`);
        if (nextPageEl) {
            const canvas = nextPageEl.querySelector('canvas');
            if (canvas) {
                underneathEl.innerHTML = '';
                const clonedCanvas = canvas.cloneNode(true);
                clonedCanvas.getContext('2d').drawImage(canvas, 0, 0);
                underneathEl.appendChild(clonedCanvas);
                underneathEl.style.display = 'block';
            }
        }
    }

    function hidePageUnderneath() {
        const underneathEl = document.getElementById('page-underneath');
        if (underneathEl) {
            underneathEl.style.display = 'none';
        }
    }

    state.pageFlip.on('changeOrientation', () => {
        updateCreaseVisibility();
    });

    // Set initial cover state
    updateCoverState();

    // Set initial cover state
    updateCoverState();

    // Render visible pages
    await renderVisiblePages();
}

async function renderVisiblePages() {
    const currentIndex = state.pageFlip.getCurrentPageIndex();
    const pagesToRender = new Set();

    // Current page(s)
    pagesToRender.add(currentIndex + 1);

    if (state.isDoublePageMode) {
        // Also render adjacent page in spread
        if ((currentIndex + 1) % 2 === 0) {
            pagesToRender.add(currentIndex + 2);
        } else {
            pagesToRender.add(currentIndex);
        }
    }

    // Preload nearby pages - extend further for double-page mode
    const preloadRange = state.isDoublePageMode ? 4 : 2;
    for (let i = -2; i <= preloadRange; i++) {
        const pageNum = currentIndex + 1 + i;
        if (pageNum >= 1 && pageNum <= state.totalPages) {
            pagesToRender.add(pageNum);
        }
    }

    // Render each page
    for (const pageNum of pagesToRender) {
        await renderPageContent(pageNum);
    }
}

// Pre-render all pages for smooth flipping
async function preRenderAllPages() {
    const renderPromises = [];
    for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
        renderPromises.push(renderPageContent(pageNum));
    }
    await Promise.all(renderPromises);
}

async function renderPageContent(pageNum) {
    const pageElement = document.querySelector(`.page[data-page-num="${pageNum}"]`);
    if (!pageElement) return;

    const contentDiv = pageElement.querySelector('.page-content');
    if (contentDiv.querySelector('canvas')) return; // Already rendered

    const width = state.basePageWidth;
    const height = state.basePageHeight;

    const canvas = await renderPage(pageNum, width, height);
    contentDiv.innerHTML = '';
    contentDiv.appendChild(canvas);

    // Add text layer for search highlighting
    await addTextLayer(pageNum, contentDiv, width, height);

    // For single-page mode, clone canvas to backside for mirrored effect
    const backsideDiv = pageElement.querySelector('.page-backside');
    if (backsideDiv && !state.isDoublePageMode) {
        const clonedCanvas = canvas.cloneNode(true);
        // Copy canvas content
        const ctx = clonedCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        backsideDiv.innerHTML = '';
        backsideDiv.appendChild(clonedCanvas);
    }
}

async function addTextLayer(pageNum, container, width, height) {
    try {
        const page = await state.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const textContent = await page.getTextContent();

        // Create text layer container
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'text-layer';
        textLayerDiv.style.width = `${width}px`;
        textLayerDiv.style.height = `${height}px`;

        // Render text items
        textContent.items.forEach(item => {
            const tx = pdfjsLib.Util.transform(scaledViewport.transform, item.transform);

            const span = document.createElement('span');
            span.textContent = item.str;
            span.style.left = `${tx[4]}px`;
            span.style.top = `${tx[5] - 15}px`;
            span.style.fontSize = `${Math.abs(tx[0])}px`;
            span.style.fontFamily = item.fontName || 'sans-serif';

            textLayerDiv.appendChild(span);
        });

        container.appendChild(textLayerDiv);
    } catch (error) {
        console.error(`Error adding text layer for page ${pageNum}:`, error);
    }
}

// ============================================
// Zoom and Pan Controls
// ============================================

function setupZoomPanControls() {
    const magazineContainer = document.getElementById('magazine-container');
    const woodenTable = document.querySelector('.wooden-table');
    let isPanning = false;
    let startPanX, startPanY;

    // Suppress context menu globally on the viewer
    if (woodenTable) {
        woodenTable.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    // Prevent right-click from triggering anything in flipbook
    if (elements.flipbook) {
        elements.flipbook.addEventListener('mousedown', (e) => {
            // Allow left click for page turning, but prevent default for right click
            if (e.button === 2) {
                e.preventDefault();
                // e.stopPropagation(); // Removed to allow panning
            }
        }, true);

        elements.flipbook.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }

    // Mouse wheel zoom
    woodenTable.addEventListener('wheel', (e) => {
        // Ctrl+Wheel is standard for browser zoom, but here we want to hijack it?
        // Or just simple wheel.
        // Let's support simple wheel for zoom like a map
        e.preventDefault();

        const zoomSpeed = 0.15;
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
        const newZoom = Math.min(Math.max(state.zoom + delta, state.minZoom), state.maxZoom);

        if (state.zoom !== newZoom) {
            state.zoom = newZoom;
            updateTransform();
        }
    }, { passive: false });

    // Panning (Right Mouse Button)
    woodenTable.addEventListener('mousedown', (e) => {
        if (e.button === 2) { // Right mouse button
            e.stopPropagation();
            isPanning = true;
            // Record start position relative to current pan
            startPanX = e.clientX - state.panX;
            startPanY = e.clientY - state.panY;

            magazineContainer.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }, true);

    // Capture mouseup on the table to stop propagation if we were panning with right click
    woodenTable.addEventListener('mouseup', (e) => {
        if (e.button === 2 && isPanning) {
            e.stopPropagation();
            isPanning = false;
            magazineContainer.style.cursor = 'grab';
        }
    }, true);

    document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;

        e.preventDefault();
        state.panX = e.clientX - startPanX;
        state.panY = e.clientY - startPanY;
        updateTransform();
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 2 && isPanning) {
            isPanning = false;
            magazineContainer.style.cursor = 'grab';
        }
    });

    // Mobile pinch-zoom + Two-finger Pan support
    let initialPinchDistance = 0;
    let initialPinchZoom = 1;
    let initialPinchCenter = { x: 0, y: 0 };
    let initialPanState = { x: 0, y: 0 };

    magazineContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Stop propagation to prevent page flip engine from interpreting this as a swipe
            e.stopPropagation();

            initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
            initialPinchZoom = state.zoom;
            initialPinchCenter = getCenter(e.touches[0], e.touches[1]);
            initialPanState = { x: state.panX, y: state.panY };
        }
    }, { passive: false }); // passive: false needed to allow preventDefault? Actually capture is better?

    magazineContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault(); // Prevent browser zoom/scroll
            e.stopPropagation(); // Prevent page flip

            // 1. PINCH ZOOM
            const distance = getDistance(e.touches[0], e.touches[1]);
            if (initialPinchDistance > 0) {
                const scale = distance / initialPinchDistance;
                state.zoom = Math.min(Math.max(initialPinchZoom * scale, state.minZoom), state.maxZoom);
            }

            // 2. TWO-FINGER PAN
            const currentCenter = getCenter(e.touches[0], e.touches[1]);
            const deltaX = currentCenter.x - initialPinchCenter.x;
            const deltaY = currentCenter.y - initialPinchCenter.y;

            state.panX = initialPanState.x + deltaX;
            state.panY = initialPanState.y + deltaY;

            updateTransform();
        } else if (state.isMobilePanMode && e.touches.length === 1) {
            // Single finger pan in Pan Mode
            e.preventDefault();
            e.stopPropagation();
            // Logic for 1-finger pan needs distinct start tracking
            // For now, let's rely on 2-finger pan or the toggle buttons we add below
        }
    }, { passive: false });

    function getDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getCenter(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    // Double-click to toggle zoom
    elements.flipbook.addEventListener('dblclick', (e) => {
        toggleZoom();
    });
}

function updateTransform() {
    const magazineContainer = document.getElementById('magazine-container');
    if (!magazineContainer) return;

    magazineContainer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    // Only animate if we are NOT panning (panning should be instant)
    // We can infer panning state or just leave it instant?
    // Transition looks nice for Zoom In Click, but bad for Wheel/Pan.
    // Let's set transition based on source? Hard to pass.
    // Default to fast/none for responsiveness.
    // Or set strictly in CSS and remove inline?
    // Let's use simple logic:
    magazineContainer.style.transition = 'none';
    // If we want smooth zoom for buttons, we can add class or handle it.
}

function toggleZoom() {
    if (state.zoom === 1) {
        state.zoom = 1.8;
        // Optionally center on click? For now, simple center zoom
        state.panX = 0;
        state.panY = 0;
    } else {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
    }
    updateTransform();
}

// ============================================
// Navigation
// ============================================

function goToPrevPage() {
    if (state.pageFlip) {
        state.pageFlip.flipPrev();
    }
}

function goToNextPage() {
    if (state.pageFlip) {
        state.pageFlip.flipNext();
    }
}

function goToPage(pageNum) {
    if (state.pageFlip && pageNum >= 1 && pageNum <= state.totalPages) {
        state.pageFlip.flip(pageNum - 1);
        state.currentPage = pageNum;
        updatePageIndicator();
    }
}

function handlePageInputChange() {
    const pageNum = parseInt(elements.pageInput.value);
    if (pageNum >= 1 && pageNum <= state.totalPages) {
        goToPage(pageNum);
    } else {
        elements.pageInput.value = state.currentPage;
    }
}

function updatePageIndicator() {
    elements.pageInput.value = state.currentPage;
}

function updateUrl() {
    window.history.replaceState(null, '', `#page=${state.currentPage}`);
}

// ============================================
// Search
// ============================================

function handleSearch() {
    const query = elements.searchInput.value.toLowerCase().trim();

    // Clear existing highlights
    clearSearchHighlights();

    if (!query) {
        state.searchResults = [];
        state.currentSearchIndex = -1;
        state.currentSearchQuery = '';
        elements.searchResults.textContent = '';
        return;
    }

    state.currentSearchQuery = query;
    state.searchResults = [];

    for (let i = 1; i <= state.totalPages; i++) {
        const pageText = state.pageTexts.get(i) || '';
        if (pageText.includes(query)) {
            state.searchResults.push(i);
        }
    }

    if (state.searchResults.length > 0) {
        state.currentSearchIndex = 0;
        goToPage(state.searchResults[0]);
        updateSearchIndicator();
        // Highlight after navigating
        setTimeout(() => highlightSearchMatches(query), 100);
    } else {
        state.currentSearchIndex = -1;
        elements.searchResults.textContent = '결과 없음';
    }
}

function clearSearchHighlights() {
    const highlights = document.querySelectorAll('.text-layer span.highlight');
    highlights.forEach(span => span.classList.remove('highlight'));
}

function highlightSearchMatches(query) {
    if (!query) return;

    const textLayers = document.querySelectorAll('.text-layer');
    textLayers.forEach(layer => {
        const spans = layer.querySelectorAll('span');
        spans.forEach(span => {
            const text = span.textContent.toLowerCase();
            if (text.includes(query)) {
                span.classList.add('highlight');
            }
        });
    });
}

function goToNextSearchResult() {
    if (state.searchResults.length === 0) return;

    state.currentSearchIndex = (state.currentSearchIndex + 1) % state.searchResults.length;
    goToPage(state.searchResults[state.currentSearchIndex]);
    updateSearchIndicator();
    setTimeout(() => highlightSearchMatches(state.currentSearchQuery), 100);
}

function goToPrevSearchResult() {
    if (state.searchResults.length === 0) return;

    state.currentSearchIndex = (state.currentSearchIndex - 1 + state.searchResults.length) % state.searchResults.length;
    goToPage(state.searchResults[state.currentSearchIndex]);
    updateSearchIndicator();
    setTimeout(() => highlightSearchMatches(state.currentSearchQuery), 100);
}

function updateSearchIndicator() {
    if (state.searchResults.length > 0) {
        elements.searchResults.textContent = `${state.currentSearchIndex + 1} / ${state.searchResults.length}`;
    }
}

// ============================================
// View Mode
// ============================================

function toggleViewMode() {
    // Prevent switching to double-page mode on mobile
    if (state.isMobile && !state.isDoublePageMode) {
        showToast('모바일에서는 양면 보기를 지원하지 않습니다');
        return;
    }

    state.isDoublePageMode = !state.isDoublePageMode;

    // Update icons
    elements.iconSingle.classList.toggle('hidden', state.isDoublePageMode);
    elements.iconDouble.classList.toggle('hidden', !state.isDoublePageMode);

    // Update flipbook class for styling
    elements.flipbook.classList.toggle('single-mode', !state.isDoublePageMode);

    // Reinitialize flipbook
    if (state.pdfDoc) {
        state.pageCache.clear();
        initFlipbook();
    }

    updateCreaseVisibility();
}

function updateCreaseVisibility() {
    elements.creaseOverlay.classList.toggle('hidden', !state.isDoublePageMode);
}

// Update cover state for hiding empty side placeholders
function updateCoverState() {
    const wrapper = document.querySelector('.stf__wrapper');
    if (!wrapper || !state.pageFlip) return;

    const currentIndex = state.pageFlip.getCurrentPageIndex();

    // Check if we're at the front cover (page 0) or back cover (last page)
    if (currentIndex === 0) {
        wrapper.dataset.atCover = 'front';
    } else if (currentIndex >= state.totalPages - 1) {
        wrapper.dataset.atCover = 'back';
    } else {
        delete wrapper.dataset.atCover;
    }
}

// ============================================
// Zoom
// ============================================

function zoomIn() {
    if (state.zoom < state.maxZoom) {
        state.zoom = Math.min(state.zoom + 0.25, state.maxZoom);
        updateTransform();
    }
}

function zoomOut() {
    if (state.zoom > state.minZoom) {
        state.zoom = Math.max(state.zoom - 0.25, state.minZoom);
        updateTransform();
    }
}

function resetZoom() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    updateTransform();
}

// ============================================
// Fullscreen
// ============================================

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err);
            showToast('전체 화면을 사용할 수 없습니다');
        });
    } else {
        document.exitFullscreen();
    }
}

function handleFullscreenChange() {
    state.isFullscreen = !!document.fullscreenElement;

    // Update button icon (could toggle between expand/compress icons)
    if (state.isFullscreen) {
        showToast('ESC를 눌러 전체 화면 종료');
    }

    // Resize flipbook
    setTimeout(() => handleResize(), 100);
}

// ============================================
// Share
// ============================================

function shareLink() {
    const url = window.location.href;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('링크가 복사되었습니다!');
        }).catch(() => {
            fallbackCopyToClipboard(url);
        });
    } else {
        fallbackCopyToClipboard(url);
    }
}

function fallbackCopyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showToast('Link copied to clipboard!');
    } catch (err) {
        showToast('Failed to copy link');
    }

    document.body.removeChild(textarea);
}

// ============================================
// Keyboard Navigation
// ============================================

function handleKeydown(e) {
    // Don't handle if typing in an input
    if (e.target.tagName === 'INPUT') return;

    switch (e.key) {
        case 'ArrowLeft':
            goToPrevPage();
            e.preventDefault();
            break;
        case 'ArrowRight':
        case ' ':
            goToNextPage();
            e.preventDefault();
            break;
        case 'Home':
            goToPage(1);
            e.preventDefault();
            break;
        case 'End':
            goToPage(state.totalPages);
            e.preventDefault();
            break;
        case 'f':
        case 'F':
            if (!e.ctrlKey && !e.metaKey) {
                toggleFullscreen();
                e.preventDefault();
            }
            break;
        case 'Escape':
            if (state.zoom !== 1 || state.panX !== 0 || state.panY !== 0) {
                resetZoom();
            }
            break;
    }
}

// ============================================
// Resize Handler
// ============================================

function handleResize() {
    // Check if we've crossed the mobile breakpoint
    const modeChanged = checkMobileMode();

    if (state.pdfDoc && state.pageFlip) {
        // If mobile mode changed, reinitialize flipbook
        if (modeChanged) {
            state.pageCache.clear();
            initFlipbook();
            updateCreaseVisibility();
        } else {
            // StPageFlip doesn't have updatePageSize - reinitialize for size changes
            // Only reinitialize if size changed significantly
            const viewerContainer = document.getElementById('viewer-container');
            const toolbarHeight = 72;
            const newWidth = (viewerContainer ? viewerContainer.clientWidth : window.innerWidth) - 40;
            const newHeight = (viewerContainer ? viewerContainer.clientHeight : window.innerHeight) - toolbarHeight - 40;

            // Check if significant size change
            const aspectRatio = state.basePageWidth / state.basePageHeight;
            const expectedWidth = state.isDoublePageMode ? newWidth / 2 : newWidth;
            if (Math.abs(expectedWidth - state.basePageWidth) > 50) {
                initFlipbook();
            }
        }
    }
}

// ============================================
// UI Helpers
// ============================================

function showLoading(text = 'Loading...') {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

function showToast(message, duration = 3000) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');

    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, duration);
}

function openNewPdf() {
    // Reset state
    state.pdfDoc = null;
    state.pageCache.clear();
    state.pageTexts.clear();
    state.searchResults = [];
    state.currentSearchIndex = -1;
    state.currentPage = 1;
    state.zoom = 1;

    if (state.pageFlip) {
        state.pageFlip.destroy();
        state.pageFlip = null;
    }

    // Reset UI
    elements.flipbook.innerHTML = '';
    elements.searchInput.value = '';
    elements.searchResults.textContent = '';
    elements.pageInput.value = 1;
    elements.pdfUpload.value = '';

    // Show upload screen
    elements.viewerContainer.classList.add('hidden');
    elements.uploadScreen.classList.remove('hidden');
}

// ============================================
// Utility Functions
// ============================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function updateFlipGuides() {
    const rightGuide = document.querySelector('.flip-guide-right');
    const rightTopGuide = document.querySelector('.flip-guide-right-top');
    const currentPage = state.currentPage; // 1-based index

    // Hide guides if on the last page
    const isLastPage = (currentPage >= state.totalPages);

    if (rightGuide) {
        rightGuide.classList.toggle('hidden', isLastPage);
    }

    if (rightTopGuide) {
        rightTopGuide.classList.toggle('hidden', isLastPage);
    }
}

// ============================================
// Utility Functions
// ============================================

function setupMobileControls() {
    const prevBtn = document.getElementById('mob-prev');
    const nextBtn = document.getElementById('mob-next');
    const panToggleBtn = document.getElementById('mob-pan-toggle');
    const iconPanOff = document.getElementById('icon-pan-off');
    const iconPanOn = document.getElementById('icon-pan-on');
    const magazineContainer = document.getElementById('magazine-container');

    state.isMobilePanMode = false;

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (state.pageFlip) state.pageFlip.flipPrev();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (state.pageFlip) state.pageFlip.flipNext();
        });
    }

    if (panToggleBtn) {
        panToggleBtn.addEventListener('click', () => {
            state.isMobilePanMode = !state.isMobilePanMode;

            // UI Update
            if (state.isMobilePanMode) {
                iconPanOff.classList.add('hidden');
                iconPanOn.classList.remove('hidden');
                panToggleBtn.classList.add('bg-white/10');
            } else {
                iconPanOff.classList.remove('hidden');
                iconPanOn.classList.add('hidden');
                panToggleBtn.classList.remove('bg-white/10');
            }
        });
    }

    // Single Finger Pan Logic
    let lastTouchX = 0;
    let lastTouchY = 0;

    const handleTouchStart = (e) => {
        // Block multi-touch (pinch) from triggering flip
        if (e.touches.length > 1) {
            e.stopPropagation();
        }

        if (state.isMobilePanMode && e.touches.length === 1) {
            e.stopPropagation(); // Stop flip engine
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }
    };

    const handleTouchMove = (e) => {
        // Block multi-touch (pinch) from triggering flip
        if (e.touches.length > 1) {
            e.stopPropagation();
        }

        if (state.isMobilePanMode && e.touches.length === 1) {
            e.preventDefault();
            e.stopPropagation(); // Stop flip engine

            const deltaX = e.touches[0].clientX - lastTouchX;
            const deltaY = e.touches[0].clientY - lastTouchY;

            state.panX += deltaX;
            state.panY += deltaY;
            updateTransform();

            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }
    };

    const handleTouchEnd = (e) => {
        // Block multi-touch end events if needed, though usually start/move is enough
        // Intercept touchend to prevent "tap to flip" or "swipe release" logic in the library
        if (state.isMobilePanMode || e.touches.length > 0) { // e.touches is 0 on touchend usually, need changedTouches?
            // Actually StPageFlip uses touchend to determine swipe result.
            // If we stopped start/move, it might not have started a flip.
            // But let's be safe.
        }

        if (state.isMobilePanMode) {
            e.stopPropagation();
        }
    };

    // Use Capture phase to intercept events BEFORE StPageFlip gets them
    magazineContainer.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    magazineContainer.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    magazineContainer.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
    magazineContainer.addEventListener('touchcancel', handleTouchEnd, { passive: false, capture: true });
}

// ============================================
// Initialize App
// ============================================

document.addEventListener('DOMContentLoaded', init);
