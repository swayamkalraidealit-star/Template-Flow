/**
 * TemplateFlow Core Logic
 */

import { createClient } from '@supabase/supabase-js'

class TemplateFlow {
    constructor() {
        this.supabase = createClient(
            import.meta.env.VITE_SUPABASE_URL,
            import.meta.env.VITE_SUPABASE_ANON_KEY
        );
        this.templatedApiKey = import.meta.env.VITE_TEMPLATED_API_KEY;

        this.template = {
            name: "New Template",
            width: 1200,
            height: 1800,
            background: '#ffffff',
            border: { width: 0, color: '#000000' },
            layers: []
        };
        this.selectedLayerIds = new Set();
        this.clipboard = [];
        this.scale = 1.0;

        this.init();
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
        // Start with an empty canvas as requested
        this.template.layers = [];
        this.render();
        
        // Initial mobile state
        this.switchMobileTab('editor');

        // Try to fetch existing template on load
        this.fetchTemplates();
    }

    cacheDOM() {
        this.canvas = document.getElementById('canvas');
        this.workspace = document.getElementById('workspace');
        this.layerList = document.getElementById('layerList');
        this.propertiesContent = document.getElementById('propertiesContent');
        this.statusMessage = document.getElementById('statusMessage');
        this.toastContainer = document.getElementById('toastContainer');

        // Buttons
        this.showGalleryBtn = document.getElementById('showGallery');
        this.newTemplateBtn = document.getElementById('newTemplate');
        this.addTextBtn = document.getElementById('addTextLayer');
        this.addImageBtn = document.getElementById('addImageLayer');
        this.saveBtn = document.getElementById('saveTemplate');
        this.renderBtn = document.getElementById('renderImage');
        this.downloadBtn = document.getElementById('downloadImage');
        this.deleteActiveBtn = document.getElementById('deleteTemplate');
        this.saveCopyBtn = document.getElementById('saveCopy');

        // Modals
        this.renderModal = document.getElementById('renderModal');
        this.templatesModal = document.getElementById('templatesModal');
        this.renderClose = document.getElementById('renderClose');
        this.templatesClose = document.getElementById('templatesClose');
        this.templatesList = document.getElementById('templatesList');

        // Mobile UI Elements
        this.mobileMenuBtn = document.getElementById('mobileMenuBtn');
        this.navActions = document.getElementById('navActions');
        this.mobileTabs = document.querySelectorAll('.mobile-tab-item');
        this.layerPanel = document.getElementById('layerPanel');
        this.propertyPanel = document.getElementById('propertyPanel');
        this.zoomValue = 0.5; // Default to 50% view as requested
    }

    bindEvents() {
        this.showGalleryBtn.addEventListener('click', () => this.showTemplatesGallery());
        this.newTemplateBtn.addEventListener('click', () => this.createNewTemplate());
        this.addTextBtn.addEventListener('click', () => this.addLayer('text'));
        this.addImageBtn.addEventListener('click', () => this.addLayer('image'));
        this.saveBtn.addEventListener('click', () => this.saveTemplate());
        this.saveCopyBtn.addEventListener('click', () => this.saveAsCopy());
        this.renderBtn.addEventListener('click', () => this.renderImage());
        this.deleteActiveBtn.addEventListener('click', () => {
            if (this.templateId) {
                this.deleteRemoteTemplate(this.templateId, this.template.name);
            }
        });
        this.renderClose.addEventListener('click', () => this.renderModal.style.display = 'none');
        this.templatesClose.addEventListener('click', () => this.templatesModal.style.display = 'none');
        window.addEventListener('click', (e) => {
            if (e.target === this.renderModal) this.renderModal.style.display = 'none';
            if (e.target === this.templatesModal) this.templatesModal.style.display = 'none';

            // Close mobile menu when clicking outside
            if (this.navActions && this.navActions.classList.contains('mobile-open')) {
                const isMenuBtn = this.mobileMenuBtn && this.mobileMenuBtn.contains(e.target);
                const isMenu = this.navActions.contains(e.target);
                if (!isMenuBtn && !isMenu) {
                    this.navActions.classList.remove('mobile-open');
                }
            }

            // Close custom selects
            if (!e.target.closest('.custom-select')) {
                document.querySelectorAll('.custom-options.open').forEach(el => el.classList.remove('open'));
            }
        });

        // Global key events
        window.addEventListener('keydown', (e) => {
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedLayerIds.size > 0 && !isInput) {
                    this.deleteSelectedLayers();
                }
            }

            // Copy (Ctrl+C)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !isInput) {
                this.copyLayers();
            }

            // Paste (Ctrl+V)
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !isInput) {
                this.pasteLayers();
            }

            // Duplicate (Ctrl+D)
            if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !isInput) {
                e.preventDefault();
                this.duplicateLayers();
            }

            // Select All (Ctrl+A)
            if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !isInput) {
                e.preventDefault();
                this.selectAll();
            }
        });

        // Handle window resize for responsiveness
        window.addEventListener('resize', () => {
            this.render();
        });

        // Marquee Selection on Canvas
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.target === this.canvas || e.target.classList.contains('template-border')) {
                this.startMarquee(e);
            }
        });

        // Mobile Events
        if (this.mobileMenuBtn) {
            this.mobileMenuBtn.addEventListener('click', () => this.toggleMobileMenu());
        }

        this.mobileTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                this.switchMobileTab(tabName);
            });
        });

        // Zoom control is now handled by custom-select
    }

    calculateScale() {
        // Mobile behavior: Smart auto-fit
        if (window.innerWidth <= 768) {
            const padding = 20;
            const availableWidth = window.innerWidth - padding;
            const scale = Math.min(1.0, availableWidth / 1200);
            return Math.max(0.2, scale);
        }

        // Desktop behavior: Fixed 50% scale for the overview
        return 0.5;
    }

    // --- Custom Select Logic ---
    renderCustomSelect(layerId, property, options, currentValue) {
        const id = `select-${layerId}-${property}`;
        const currentLabel = options.find(o => o.value == currentValue)?.label || currentValue;
        
        let optionsHtml = options.map(o => `
            <div class="custom-option ${o.value == currentValue ? 'selected' : ''}" 
                 onclick="app.selectCustomOption('${layerId}', '${property}', '${o.value}', this)">
                ${o.label}
            </div>
        `).join('');

        return `
            <div class="custom-select" id="${id}">
                <div class="custom-select-trigger" onclick="app.toggleCustomSelect('${id}', event)">
                    <span>${currentLabel}</span>
                </div>
                <div class="custom-options">
                    ${optionsHtml}
                </div>
            </div>
        `;
    }

    toggleCustomSelect(id, event) {
        if (event) event.stopPropagation();
        const el = document.getElementById(id);
        const options = el.querySelector('.custom-options');
        
        // Close others
        document.querySelectorAll('.custom-options.open').forEach(opened => {
            if (opened !== options) opened.classList.remove('open');
        });
        
        options.classList.toggle('open');
    }

    selectCustomOption(layerId, property, value, el) {
        this.updateLayerProperty(layerId, property, value);
        
        // Close menu
        const options = el.parentElement;
        options.classList.remove('open');
        
        // Trigger re-render to update the trigger label and other things
        this.render();
    }



    // --- Mobile Responsive Logic ---
    toggleMobileMenu() {
        this.navActions.classList.toggle('mobile-open');
    }

    switchMobileTab(tabName) {
        // Update Tab Buttons
        this.mobileTabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update Panels
        // editor, layers, props
        if (tabName === 'editor') {
            this.workspace.classList.add('mobile-active');
            this.layerPanel.classList.remove('mobile-active');
            this.propertyPanel.classList.remove('mobile-active');
        } else if (tabName === 'layers') {
            this.workspace.classList.remove('mobile-active');
            this.layerPanel.classList.add('mobile-active');
            this.propertyPanel.classList.remove('mobile-active');
        } else if (tabName === 'props') {
            this.workspace.classList.remove('mobile-active');
            this.layerPanel.classList.remove('mobile-active');
            this.propertyPanel.classList.add('mobile-active');
        }

        // Close mobile menu if open
        if (this.navActions) {
            this.navActions.classList.remove('mobile-open');
        }

        // Force a render to update anything visual
        this.render();
    }

    /**
     * Parse font size from various formats (string with px, number, etc.)
     * Converts "64px", "64", 64 to number 64
     */
    parseFontSize(fontSize) {
        if (!fontSize && fontSize !== 0) return 16; // Default fallback
        
        // If it's a string, remove 'px' and parse
        if (typeof fontSize === 'string') {
            const parsed = parseInt(fontSize.replace('px', '').trim());
            return isNaN(parsed) ? 16 : Math.max(1, parsed);
        }
        
        // If it's already a number
        if (typeof fontSize === 'number') {
            return Math.max(1, fontSize);
        }
        
        return 16; // Fallback
    }

    /**
     * Parse numeric values from various formats (strings, numbers, etc.)
     * Handles cases like "100", 100, "100px", etc.
     */
    parseNumericValue(value, min = 0) {
        if (value === null || value === undefined) return min;
        
        if (typeof value === 'string') {
            const parsed = parseInt(value.replace(/[^\d.-]/g, ''));
            return isNaN(parsed) ? min : Math.max(min, parsed);
        }
        
        if (typeof value === 'number') {
            return Math.max(min, value);
        }
        
        return min;
    }

    loadInitialLayers() {
        const defaultLayers = [
            { layer: "text-center-1", type: "text", text: "HEADING", x: 450, y: 120, width: 300, height: 60, fontSize: 40, align: "center", fontWeight: "700" },
            { layer: "line1-text", type: "text", text: "Line 1 Content", x: 80, y: 260, width: 1040, height: 160, fontSize: 42, color: "#1a1a1a" },
            { layer: "line1-image", type: "image", image_url: "https://via.placeholder.com/160", x: 960, y: 260, width: 160, height: 160 },
            { layer: "line2-text", type: "text", text: "Line 2 Content", x: 80, y: 520, width: 1040, height: 160, fontSize: 42, color: "#1a1a1a" },
            { layer: "line2-image", type: "image", image_url: "https://via.placeholder.com/160", x: 960, y: 520, width: 160, height: 160 }
        ];

        this.template.layers = defaultLayers.map((l, i) => ({ 
            ...l, 
            id: `layer-${Date.now()}-${i}`,
            borderWidth: 0,
            borderColor: '#000000',
            letterSpacing: 0,
            wordSpacing: 0,
            lineHeight: 1.2
        }));
    }

    addLayer(type) {
        const id = `layer-${Date.now()}`;
        const newLayer = type === 'text' ? {
            id,
            layer: `text-${this.template.layers.length + 1}`,
            type: 'text',
            text: 'New Text',
            x: 100,
            y: 100,
            width: 400,
            height: 100,
            fontSize: 40,
            fontWeight: '400',
            letterSpacing: 0,
            wordSpacing: 0,
            lineHeight: 1.1,
            align: 'left',
            color: '#1a1a1a',
            borderWidth: 0,
            borderColor: '#000000'
        } : {
            id, // Critical: must match what selectedLayerIds tracks
            layer: `image-${this.template.layers.length + 1}`,
            type: 'image',
            image_url: '', // Empty by default — user uploads via Supabase
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            borderWidth: 0,
            borderColor: '#000000'
        };

        this.template.layers.push(newLayer);
        this.selectedLayerIds.clear();
        this.selectedLayerIds.add(id);
        this.render();
        this.updateStatus(`Added ${type} layer`);
    }

    selectLayer(id, isMulti = false) {
        const alreadySelected = this.selectedLayerIds.has(id);

        if (!isMulti && !alreadySelected) {
            this.selectedLayerIds.clear();
        }

        if (isMulti) {
            if (alreadySelected) {
                this.selectedLayerIds.delete(id);
            } else {
                this.selectedLayerIds.add(id);
            }
        } else {
            this.selectedLayerIds.add(id);
        }

        this.render();
    }

    updateLayerProperty(id, prop, value, skipRenderProps = false) {
        const layer = this.template.layers.find(l => l.id === id);
        if (layer) {
            // Special handling for font size - parse from various formats
            if (prop === 'fontSize') {
                value = this.parseFontSize(value);
            }
            // Special handling for line height - convert to number
            else if (prop === 'lineHeight') {
                value = parseFloat(value) || 1.2;
            }
            // Standard numeric parsing
            else if (['x', 'y', 'width', 'height', 'borderWidth', 'letterSpacing', 'wordSpacing'].includes(prop)) {
                value = this.parseNumericValue(value, 0);
            }
            
            layer[prop] = value;

            // Always update visual parts
            this.calculateScale();
            this.renderCanvas();
            this.renderLayerList();

            // Only update property panel if not explicitly skipped (e.g. during typing)
            if (!skipRenderProps) {
                this.renderProperties();
            }
        }
    }

    updateTemplateProperty(prop, value) {
        if (['width', 'height'].includes(prop)) {
            value = parseInt(value) || 100;
        }
        this.template[prop] = value;
        this.calculateScale();
        this.render();
    }

    deleteSelectedLayers() {
        const idsToDelete = Array.from(this.selectedLayerIds);
        this.template.layers = this.template.layers.filter(l => !idsToDelete.includes(l.id));
        this.selectedLayerIds.clear();
        this.render();
        this.updateStatus(`Deleted ${idsToDelete.length} layer(s)`);
    }

    copyLayers() {
        if (this.selectedLayerIds.size === 0) return;

        this.clipboard = Array.from(this.selectedLayerIds).map(id => {
            const layer = this.template.layers.find(l => l.id === id);
            return JSON.parse(JSON.stringify(layer)); // Deep copy
        });

        this.updateStatus(`Copied ${this.clipboard.length} layer(s)`);
    }

    pasteLayers(offset = 40) {
        if (this.clipboard.length === 0) return;

        const newIds = [];
        this.clipboard.forEach(layer => {
            const newLayer = JSON.parse(JSON.stringify(layer));
            const newId = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            newLayer.id = newId;
            newLayer.layer = newId; // Maintain strict uniqueness for API mapping
            newLayer.x += offset;
            newLayer.y += offset;

            this.template.layers.push(newLayer);
            newIds.push(newLayer.id);
        });

        this.selectedLayerIds.clear();
        newIds.forEach(id => this.selectedLayerIds.add(id));
        this.render();
        this.updateStatus(`Pasted ${newIds.length} layer(s)`);
    }

    duplicateLayers() {
        this.copyLayers();
        this.pasteLayers(20);
    }

    selectAll() {
        this.selectedLayerIds.clear();
        this.template.layers.forEach(l => this.selectedLayerIds.add(l.id));
        this.render();
        this.updateStatus(`Selected all (${this.template.layers.length} layers)`);
    }

    startMarquee(e) {
        const rect = this.canvas.getBoundingClientRect();
        const startX = (e.clientX - rect.left) / this.scale;
        const startY = (e.clientY - rect.top) / this.scale;

        const selectionBox = document.createElement('div');
        selectionBox.className = 'selection-marquee';
        this.canvas.appendChild(selectionBox);

        const onMouseMove = (moveEvent) => {
            const currentX = (moveEvent.clientX - rect.left) / this.scale;
            const currentY = (moveEvent.clientY - rect.top) / this.scale;

            const x = Math.min(startX, currentX);
            const y = Math.min(startY, currentY);
            const w = Math.abs(currentX - startX);
            const h = Math.abs(currentY - startY);

            selectionBox.style.left = `${x * this.scale}px`;
            selectionBox.style.top = `${y * this.scale}px`;
            selectionBox.style.width = `${w * this.scale}px`;
            selectionBox.style.height = `${h * this.scale}px`;

            // Selection logic
            if (!moveEvent.shiftKey && !moveEvent.ctrlKey && !moveEvent.metaKey) {
                this.selectedLayerIds.clear();
            }

            this.template.layers.forEach(layer => {
                const inBounds = (
                    layer.x < x + w &&
                    layer.x + layer.width > x &&
                    layer.y < y + h &&
                    layer.y + layer.height > y
                );
                if (inBounds) {
                    this.selectedLayerIds.add(layer.id);
                }
            });
            this.render();
        };

        const onMouseUp = () => {
            selectionBox.remove();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    deleteLayer(id) {
        this.template.layers = this.template.layers.filter(l => l.id !== id);
        this.selectedLayerIds.delete(id);
        this.render();
        this.updateStatus('Layer deleted');
    }

    render() {
        this.scale = this.calculateScale();
        this.renderLayerList();
        this.renderCanvas();
        this.renderProperties();
        this.updateHeaderButtons();
    }

    updateHeaderButtons() {
        if (this.deleteActiveBtn) {
            this.deleteActiveBtn.style.display = this.templateId ? 'inline-flex' : 'none';
        }
        if (this.saveCopyBtn) {
            this.saveCopyBtn.style.display = this.templateId ? 'inline-flex' : 'none';
        }
    }

    renderLayerList() {
        this.layerList.innerHTML = '';
        this.template.layers.forEach(layer => {
            const li = document.createElement('li');
            li.className = `layer-item ${this.selectedLayerIds.has(layer.id) ? 'active' : ''}`;
            li.innerHTML = `
                <span class="icon">${layer.type === 'text' ? 'T' : '🖼️'}</span>
                <span class="name">${layer.layer}</span>
                <button class="delete-btn" data-id="${layer.id}">×</button>
            `;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn')) {
                    this.deleteLayer(layer.id);
                } else {
                    this.selectLayer(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);
                }
            });
            this.layerList.appendChild(li);
        });
    }

    renderCanvas() {
        this.canvas.innerHTML = '';

        // Apply scale and dimensions to canvas
        this.canvas.style.width = `${this.template.width * this.scale}px`;
        this.canvas.style.height = `${this.template.height * this.scale}px`;
        this.canvas.style.backgroundColor = this.template.background || '#ffffff';

        // Template Border (Framing)
        if (this.template.border && this.template.border.width > 0) {
            const borderEl = document.createElement('div');
            borderEl.className = 'template-border';
            borderEl.style.position = 'absolute';
            borderEl.style.top = '0';
            borderEl.style.left = '0';
            borderEl.style.right = '0';
            borderEl.style.bottom = '0';
            borderEl.style.boxSizing = 'border-box';
            borderEl.style.border = `${this.template.border.width * this.scale}px solid ${this.template.border.color}`;
            borderEl.style.pointerEvents = 'none';
            borderEl.style.zIndex = '5'; // Below all layers (base 10)
            this.canvas.appendChild(borderEl);
        }

        this.template.layers.forEach(layer => {
            const isSelected = this.selectedLayerIds.has(layer.id);
            const el = document.createElement('div');
            el.className = `layer-element ${isSelected ? 'selected' : ''}`;
            el.style.position = 'absolute';
            el.style.left = `${layer.x * this.scale}px`;
            el.style.top = `${layer.y * this.scale}px`;
            el.style.width = `${layer.width * this.scale}px`;
            el.style.height = `${layer.height * this.scale}px`;
            el.style.zIndex = isSelected ? '100' : '10';
            el.style.boxSizing = 'border-box';
            el.style.padding = '0';
            el.style.margin = '0';

            if (layer.type === 'text') {
                el.style.fontSize = `${layer.fontSize * this.scale}px`;
                el.style.fontWeight = layer.fontWeight || '400';
                el.style.letterSpacing = `${(layer.letterSpacing || 0) * this.scale}px`;
                el.style.wordSpacing = `${(layer.wordSpacing || 0) * this.scale}px`;
                el.style.lineHeight = layer.lineHeight || '1.2'; 
                el.style.color = layer.color || '#000000';
                el.style.textAlign = layer.align || 'left';
                el.style.fontFamily = layer.fontFamily || 'Inter';
                el.style.display = 'flex';
                el.style.alignItems = 'flex-start';
                el.style.justifyContent = (layer.align === 'center' ? 'center' : (layer.align === 'right' ? 'flex-end' : 'flex-start'));
                el.style.padding = '0';
                el.style.margin = '0';
                el.style.overflow = 'visible';
                el.style.whiteSpace = 'normal';
                el.innerText = layer.text;
                el.style.wordBreak = 'break-word'; 
            } else if (layer.type === 'image') {
                const img = document.createElement('img');
                img.src = layer.image_url;
                img.crossOrigin = 'anonymous'; // Important for Supabase/CORS
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                el.appendChild(img);
            }

            // Apply Individual Layer Border
            if (layer.borderWidth > 0) {
                el.style.border = `${layer.borderWidth * this.scale}px solid ${layer.borderColor || '#000000'}`;
                el.style.boxSizing = 'border-box';
            } else {
                el.style.border = 'none';
            }

            // Resize handle
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            el.appendChild(handle);

            el.addEventListener('mousedown', (e) => {
                this.selectLayer(layer.id, e.shiftKey || e.ctrlKey || e.metaKey);
                if (e.target.classList.contains('resize-handle')) {
                    this.startResizing(e, layer, el);
                } else {
                    this.startDragging(e, layer, el);
                }
            });

            this.canvas.appendChild(el);
        });
    }

    startDragging(e, layer, el) {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startY = e.clientY;

        // Simpler: Store the layer objects and their start positions
        const selectedLayersInfo = Array.from(this.selectedLayerIds).map(id => {
            const l = this.template.layers.find(lyr => lyr.id === id);
            return l ? { layer: l, startX: l.x, startY: l.y } : null;
        }).filter(Boolean);

        const onMouseMove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / this.scale;
            const dy = (moveEvent.clientY - startY) / this.scale;

            selectedLayersInfo.forEach(info => {
                info.layer.x = Math.round(info.startX + dx);
                info.layer.y = Math.round(info.startY + dy);
            });

            // Re-render visual canvas
            this.renderCanvas();
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Final render to sync everything
            this.render();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    startResizing(e, layer, el) {
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = layer.width;
        const startHeight = layer.height;

        const onMouseMove = (moveEvent) => {
            const dx = (moveEvent.clientX - startX) / this.scale;
            const dy = (moveEvent.clientY - startY) / this.scale;
            this.updateLayerProperty(layer.id, 'width', Math.max(10, Math.round(startWidth + dx)));
            this.updateLayerProperty(layer.id, 'height', Math.max(10, Math.round(startHeight + dy)));
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    renderProperties() {
        if (this.selectedLayerIds.size === 0) {
            this.renderTemplateProperties();
            return;
        }

        if (this.selectedLayerIds.size > 1) {
            this.propertiesContent.innerHTML = `
                <div class="empty-state">
                    <p>${this.selectedLayerIds.size} layers selected</p>
                    <p style="font-size: 0.8rem; margin-top: 1rem;">Press <b>Ctrl+D</b> to duplicate all</p>
                    <p style="font-size: 0.8rem;">Press <b>Delete</b> to remove all</p>
                </div>
            `;
            return;
        }

        if (this.selectedLayerIds.size === 0) {
            html = `
                <div class="sidebar-section-title">Template Settings</div>
                <div class="input-row">
                    <div class="property-group">
                        <label>Width (px)</label>
                        <input type="number" value="${this.template.width}" onchange="app.updateTemplateProperty('width', this.value)">
                    </div>
                    <div class="property-group">
                        <label>Height (px)</label>
                        <input type="number" value="${this.template.height}" onchange="app.updateTemplateProperty('height', this.value)">
                    </div>
                </div>
                <div class="property-group" style="margin-top: 1rem;">
                    <label>Background Color</label>
                    <input type="color" value="${this.template.background || '#ffffff'}" oninput="app.updateTemplateProperty('background', this.value)">
                </div>
                <p style="font-size: 11px; margin-top: 1rem; color: var(--text-secondary); line-height: 1.4;">
                    Adjust the template resolution to match your target output (e.g., 1080x1080). Coordinates are absolute pixels.
                </p>
            `;
            this.propertiesContent.innerHTML = html;
            return;
        }

        const selectedId = Array.from(this.selectedLayerIds)[0];
        const layer = this.template.layers.find(l => l.id === selectedId);
        let html = `
            <div class="property-group">
                <label>Layer Name</label>
                <div style="padding: 0.6rem 0.8rem; background: #1f2937; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.85rem; color: var(--text-secondary);">${layer.layer}</div>
            </div>
            <div class="input-row">
                <div class="property-group">
                    <label>X</label>
                    <input type="number" value="${layer.x}" onchange="app.updateLayerProperty('${layer.id}', 'x', this.value)">
                </div>
                <div class="property-group">
                    <label>Y</label>
                    <input type="number" value="${layer.y}" onchange="app.updateLayerProperty('${layer.id}', 'y', this.value)">
                </div>
            </div>
            <div class="input-row">
                <div class="property-group">
                    <label>Width</label>
                    <input type="number" value="${layer.width}" onchange="app.updateLayerProperty('${layer.id}', 'width', this.value)">
                </div>
                <div class="property-group">
                    <label>Height</label>
                    <input type="number" value="${layer.height}" onchange="app.updateLayerProperty('${layer.id}', 'height', this.value)">
                </div>
            </div>
        `;

        if (layer.type === 'text') {
            html += `
                <div class="property-group">
                    <label>Content</label>
                    <textarea 
                        oninput="app.updateLayerProperty('${layer.id}', 'text', this.value, true)"
                        placeholder="Enter paragraph text..."
                        style="height: 120px; line-height: 1.4; resize: vertical;"
                    >${layer.text}</textarea>
                </div>
                <div class="input-row">
                    <div class="property-group">
                        <label>Color</label>
                        <input type="color" value="${layer.color || '#1a1a1a'}" oninput="app.updateLayerProperty('${layer.id}', 'color', this.value, true)">
                    </div>
                    <div class="property-group">
                        <label>Font Size</label>
                        <input type="number" value="${layer.fontSize}" oninput="app.updateLayerProperty('${layer.id}', 'fontSize', this.value, true)">
                    </div>
                </div>
                <div class="input-row">
                    <div class="property-group">
                        <label>Weight</label>
                        ${this.renderCustomSelect(layer.id, 'fontWeight', [
                            { value: '300', label: 'Light' },
                            { value: '400', label: 'Regular' },
                            { value: '600', label: 'Semi-Bold' },
                            { value: '700', label: 'Bold' }
                        ], layer.fontWeight || '400')}
                    </div>
                    <div class="property-group">
                        <label>Spacing</label>
                        <input type="number" step="0.5" value="${layer.letterSpacing || 0}" oninput="app.updateLayerProperty('${layer.id}', 'letterSpacing', this.value, true)" placeholder="Ltr">
                    </div>
                </div>
                <div class="input-row">
                    <div class="property-group">
                        <label>Word Spacing</label>
                        <input type="number" step="0.5" value="${layer.wordSpacing || 0}" oninput="app.updateLayerProperty('${layer.id}', 'wordSpacing', this.value, true)" placeholder="Word">
                    </div>
                    <div class="property-group">
                        <label>Line Height</label>
                        <input type="number" step="0.1" value="${layer.lineHeight || 1.1}" oninput="app.updateLayerProperty('${layer.id}', 'lineHeight', this.value, true)">
                    </div>
                </div>
                <div class="property-group">
                    <label>Font Family</label>
                    ${this.renderCustomSelect(layer.id, 'fontFamily', [
                        { value: 'Inter', label: 'Inter (Sans)' },
                        { value: 'Montserrat', label: 'Montserrat (Modern)' },
                        { value: 'Roboto', label: 'Roboto (Clean)' },
                        { value: 'Playfair Display', label: 'Playfair (Elegant)' },
                        { value: 'Lora', label: 'Lora (Classic Serif)' },
                        { value: 'Courier New', label: 'Monospace' }
                    ], layer.fontFamily || 'Inter')}
                </div>
                <div class="property-group">
                    <label>Alignment</label>
                    ${this.renderCustomSelect(layer.id, 'align', [
                        { value: 'left', label: 'Left' },
                        { value: 'center', label: 'Center' },
                        { value: 'right', label: 'Right' }
                    ], layer.align || 'left')}
                </div>
                <div class="sidebar-section-title">Layer Border</div>
                <div class="input-row">
                    <div class="property-group">
                        <label>Border Color</label>
                        <input type="color" value="${layer.borderColor || '#000000'}" oninput="app.updateLayerProperty('${layer.id}', 'borderColor', this.value, true)">
                    </div>
                    <div class="property-group">
                        <label>Border Width</label>
                        <input type="number" value="${layer.borderWidth || 0}" oninput="app.updateLayerProperty('${layer.id}', 'borderWidth', this.value, true)">
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="property-group">
                    <label>Image Source</label>
                    <input type="text" id="imageUrlInput" value="${layer.image_url}" onkeyup="app.updateLayerProperty('${layer.id}', 'image_url', this.value)">
                    <p style="font-size: 10px; margin-top: 5px; color: var(--text-secondary);">Or upload to Supabase:</p>
                    <input type="file" id="imageFileInput" accept="image/*" onchange="app.uploadToSupabase('${layer.id}', this.files[0])">
                </div>
                <div class="sidebar-section-title">Image Border</div>
                <div class="input-row">
                    <div class="property-group">
                        <label>Border Color</label>
                        <input type="color" value="${layer.borderColor || '#000000'}" oninput="app.updateLayerProperty('${layer.id}', 'borderColor', this.value, true)">
                    </div>
                    <div class="property-group">
                        <label>Border Width</label>
                        <input type="number" value="${layer.borderWidth || 0}" oninput="app.updateLayerProperty('${layer.id}', 'borderWidth', this.value, true)">
                    </div>
                </div>
            `;
        }

        this.propertiesContent.innerHTML = html;
    }

    renderTemplateProperties() {
        let html = `
            <div class="sidebar-section-title">Design Info</div>
            <div class="property-group">
                <label>Template Name</label>
                <input type="text" value="${this.template.name || 'Untitled'}" onkeyup="app.template.name = this.value">
            </div>
            
            <div class="input-row">
                <div class="property-group">
                    <label>Canvas Width</label>
                    <input type="number" value="${this.template.width}" onchange="app.updateTemplateSize('width', this.value)">
                </div>
                <div class="property-group">
                    <label>Canvas Height</label>
                    <input type="number" value="${this.template.height}" onchange="app.updateTemplateSize('height', this.value)">
                </div>
            </div>
            
            <div class="sidebar-section-title">Canvas Styling</div>
            <div class="property-group">
                <label>Background Color</label>
                <input type="color" value="${this.template.background || '#ffffff'}" onchange="app.updateTemplateProperty('background', this.value)">
            </div>

            <div class="sidebar-section-title">Template Framing</div>
            <div class="input-row">
                <div class="property-group">
                    <label>Border Color</label>
                    <input type="color" value="${this.template.border.color}" onchange="app.updateTemplateBorder('color', this.value)">
                </div>
                <div class="property-group">
                    <label>Border Width</label>
                    <input type="number" value="${this.template.border.width}" onchange="app.updateTemplateBorder('width', this.value)">
                </div>
            </div>
            <p class="empty-state" style="margin-top: 2rem;">Select a layer to edit layer-specific properties</p>
        `;
        this.propertiesContent.innerHTML = html;
    }

    updateTemplateSize(prop, value) {
        this.template[prop] = parseInt(value) || 0;
        this.render();
    }

    updateTemplateProperty(prop, value) {
        this.template[prop] = value;
        this.render();
    }

    updateTemplateBorder(prop, value) {
        if (prop === 'width') value = parseInt(value) || 0;
        this.template.border[prop] = value;
        this.render();
    }

    async saveTemplate(silent = false) {
        if (!this.templatedApiKey) {
            this.updateStatus('Error: API Key missing in .env');
            return;
        }

        this.updateStatus('Saving template to Templated.io...');

        // Normalize layers before saving
        const apiLayers = this.template.layers.map(({ id, ...rest }) => {
            const fontSize = this.parseFontSize(rest.fontSize);
            const lineHeight = rest.lineHeight || 1.2;
            
            return {
                ...rest,
                layer: id, // Ensure the layer key matches our unique internal ID for perfect mapping
                fontSize: fontSize,
                font_size: `${fontSize}px`,
                font_weight: rest.fontWeight || '400',
                x: this.parseNumericValue(rest.x, 0),
                y: this.parseNumericValue(rest.y, 0),
                width: this.parseNumericValue(rest.width, 100),
                height: this.parseNumericValue(rest.height, 100),
                letterSpacing: this.parseNumericValue(rest.letterSpacing, 0),
                letter_spacing: this.parseNumericValue(rest.letterSpacing, 0),
                wordSpacing: this.parseNumericValue(rest.wordSpacing, 0),
                word_spacing: this.parseNumericValue(rest.wordSpacing, 0),
                borderWidth: this.parseNumericValue(rest.borderWidth, 0),
                border_width: this.parseNumericValue(rest.borderWidth, 0),
                lineHeight: lineHeight,
                line_height: lineHeight,
                align: rest.align || 'left',
                text_align: rest.align || 'left',
                fontFamily: rest.fontFamily || 'Inter',
                font_family: rest.fontFamily || 'Inter',
                color: rest.color || '#1a1a1a',
                borderColor: rest.borderColor || '#000000',
                border_color: rest.borderColor || '#000000'
            };
        });

        const payload = {
            name: this.template.name || "Untitled Template",
            width: this.parseNumericValue(this.template.width, 1080),
            height: this.parseNumericValue(this.template.height, 1080),
            background: this.template.background,
            layers: apiLayers
        };

        try {
            // If we have a templateId, we UPDATE. Otherwise, we CREATE.
            // When updating, we use ?replaceLayers=true to ensure layers removed in the editor 
            // are also removed on the server (Full Overwrite).
            const url = this.templateId
                ? `https://api.templated.io/v1/template/${this.templateId}?replaceLayers=true`
                : 'https://api.templated.io/v1/template';

            const method = this.templateId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.templatedApiKey}`
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (response.ok) {
                const isNew = !this.templateId;
                this.templateId = data.id || this.templateId;
                this.updateStatus(`Template ${isNew ? 'saved' : 'updated'} successfully!`);
                if (!silent) {
                    this.showToast('Template created successfully!', '🥳');
                }
            } else {
                let errorMsg = data.message || data.error || 'Failed to save';
                this.updateStatus(`Error: ${errorMsg}`);
            }
        } catch (error) {
            this.updateStatus(`Network error: ${error.message}`);
        }
    }

    async saveAsCopy() {
        if (!confirm('Save a copy of this template?')) return;
        
        const oldName = this.template.name;
        this.templateId = null; // Force create
        this.template.name = `${oldName} (Copy)`;
        
        this.updateStatus('Saving as new template...');
        await this.saveTemplate();
        
        this.render(); // This will trigger updateHeaderButtons via render()
        this.showToast('Created copy!', '📑');
    }

    async fetchTemplates() {
        if (!this.templatedApiKey) return [];

        try {
            // Added includeLayers and includePages to ensure we get the full design data
            const response = await fetch('https://api.templated.io/v1/templates?includeLayers=true&includePages=true', {
                headers: { 'Authorization': `Bearer ${this.templatedApiKey}` }
            });
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            return [];
        }
    }

    async updateTags(templateId, tags) {
        if (!this.templatedApiKey) return;
        try {
            const response = await fetch(`https://api.templated.io/v1/template/${templateId}/tags`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.templatedApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(tags)
            });
            return await response.json();
        } catch (error) {
            console.error('Tag update error:', error);
        }
    }

    async showTemplatesGallery() {
        this.templatesModal.style.display = 'block';
        this.templatesList.innerHTML = '<div class="loader-container"><div class="loader"></div><p>Fetching your designs...</p></div>';

        const templates = await this.fetchTemplates();

        if (templates.length === 0) {
            this.templatesList.innerHTML = '<p class="empty-state">No templates found. Save one to see it here!</p>';
            return;
        }

        this.templatesList.innerHTML = '';
        templates.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'template-card';
            
            // Get layer count safely
            const layers = tpl.layers ? (Array.isArray(tpl.layers) ? tpl.layers : Object.keys(tpl.layers)) : [];
            const layersCount = layers.length;
            
            card.innerHTML = `
                <button class="delete-template-btn" title="Delete Template">&times;</button>
                <div class="template-preview-stunt">
                    ${this.generateMiniPreview(tpl)}
                </div>
                <div class="card-content">
                    <h4>${tpl.name || 'Untitled'}</h4>
                    <div class="meta-tag-row">
                        <span class="badge">${tpl.width}x${tpl.height}</span>
                        <span class="badge secondary">${layersCount} Layers</span>
                    </div>
                </div>
                <button class="btn primary small-full load-btn" style="width: 100%; margin-top: 10px;">Load & Edit</button>
            `;

            // Delete click
            card.querySelector('.delete-template-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteRemoteTemplate(tpl.id, tpl.name);
            });

            card.addEventListener('click', () => this.loadTemplate(tpl));
            this.templatesList.appendChild(card);
        });
    }

    generateMiniPreview(tpl) {
        // If the template already has a screenshot or thumbnail from Templated.io, use it!
        // This is the "actual template image" the user is looking for.
        if (tpl.screenshot_url) {
            return `<img src="${tpl.screenshot_url}" style="width: 100%; height: 100%; object-fit: contain;">`;
        }
        if (tpl.thumbnail_url) {
            return `<img src="${tpl.thumbnail_url}" style="width: 100%; height: 100%; object-fit: contain;">`;
        }

        // Fallback: Create a detailed visual representation
        const layers = tpl.layers ? (Array.isArray(tpl.layers) ? tpl.layers : Object.values(tpl.layers)) : [];
        if (layers.length === 0) return '<div class="empty-preview">Empty Template</div>';

        const scale = 140 / Math.max(tpl.width, tpl.height);
        const elements = layers.slice(0, 15).map(l => {
            let inner = '';
            if (l.type === 'image' && l.image_url) {
                inner = `<img src="${l.image_url}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;">`;
            } else if (l.type === 'text') {
                inner = `<div style="color: ${l.color || '#000'}; font-size: 2px; padding: 1px; overflow: hidden;">${l.text || ''}</div>`;
            }

            const style = `
                position: absolute;
                left: ${(l.x || 0) * scale}px;
                top: ${(l.y || 0) * scale}px;
                width: ${(l.width || 50) * scale}px;
                height: ${(l.height || 20) * scale}px;
                background: ${l.type === 'image' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.2)'};
                border: 0.1px solid rgba(0,0,0,0.1);
                overflow: hidden;
                display: flex;
            `;
            return `<div style="${style}">${inner}</div>`;
        }).join('');

        return `<div class="mini-artboard" style="width: ${tpl.width * scale}px; height: ${tpl.height * scale}px; background-color: ${tpl.background || '#fff'}">${elements}</div>`;
    }

    async deleteRemoteTemplate(id, name) {
        if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;

        this.updateStatus(`Deleting template ${id}...`);
        try {
            const response = await fetch(`https://api.templated.io/v1/template/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.templatedApiKey}`
                }
            });

            if (response.status === 204 || response.ok) {
                this.updateStatus('Template deleted successfully');
                this.showToast('Template deleted', '🗑️');
                // Refresh gallery
                this.showTemplatesGallery();
                // If the deleted template was the current one, reset
                if (this.templateId === id) {
                    this.templateId = null;
                }
            } else {
                this.updateStatus('Failed to delete template');
            }
        } catch (error) {
            this.updateStatus(`Error: ${error.message}`);
        }
    }

    createNewTemplate() {
        if (this.template.layers.length > 0 && !confirm('Create new template? Current unsaved changes will be lost.')) return;

        this.templateId = null;
        this.template = {
            name: "New Template",
            width: 1200,
            height: 1800,
            background: '#ffffff',
            border: { width: 0, color: '#000000' },
            layers: []
        };
        this.selectedLayerIds.clear();
        this.render();
        this.updateStatus('Started new template');
        this.showToast('New canvas ready', '✨');
    }

    loadTemplate(tpl) {
        if (!confirm(`Switch to "${tpl.name}"? Unsaved changes in your current design will be lost.`)) return;

        this.templateId = tpl.id;
        this.template.name = tpl.name;
        this.template.width = this.parseNumericValue(tpl.width, 1080);
        this.template.height = this.parseNumericValue(tpl.height, 1080);
        this.template.background = tpl.background || '#ffffff';

        // Deep clone layers from the template
        if (tpl.layers) {
            // Templated API returns layers as objects if it was saved via API.
            // If layers is an array, we map it. If it's an object (v1/template response structure), we handle it.
            const layers = Array.isArray(tpl.layers) ? tpl.layers : Object.values(tpl.layers || {});

            this.template.layers = layers.map((l, i) => {
                // Handle both align and text_align properties from API
                const align = l.align || l.text_align || 'left';
                const fontFamily = l.fontFamily || l.font_family || 'Inter';
                const fontWeight = l.fontWeight || l.font_weight || '400';
                
                return {
                    ...l,
                    id: l.id || `loaded-layer-${Date.now()}-${i}`,
                    // Ensure default props for older saved templates and normalize numeric values
                    x: this.parseNumericValue(l.x, 0),
                    y: this.parseNumericValue(l.y, 0),
                    width: this.parseNumericValue(l.width, 200),
                    height: this.parseNumericValue(l.height, 100),
                    fontSize: this.parseFontSize(l.fontSize || l.font_size), // Handle both camelCase and snake_case
                    fontWeight: fontWeight,
                    letterSpacing: this.parseNumericValue(l.letterSpacing || l.letter_spacing, 0),
                    wordSpacing: this.parseNumericValue(l.wordSpacing || l.word_spacing, 0),
                    lineHeight: l.lineHeight || l.line_height || 1.2,
                    borderWidth: this.parseNumericValue(l.borderWidth || l.border_width, 0),
                    align: align,
                    fontFamily: fontFamily,
                    color: l.color || '#1a1a1a',
                    borderColor: l.borderColor || l.border_color || '#000000',
                    type: l.type || (l.text ? 'text' : 'image')
                };
            });
        } else {
            this.template.layers = [];
        }

        this.selectedLayerIds.clear();
        this.templatesModal.style.display = 'none';
        this.render();
        this.updateStatus(`Loaded template: ${tpl.name}`);
    }

    async renderImage(isBackground = false) {
        if (!this.templatedApiKey) {
            this.updateStatus('Error: API Key missing in .env');
            return;
        }

        // Ensure the template is saved first so the render links to the latest version
        this.updateStatus('Syncing design before rendering...');
        await this.saveTemplate(true);

        if (!this.templateId) return;

        this.updateStatus('Generating render on Templated.io...');
        if (!isBackground) {
            this.renderModal.style.display = 'block';
            document.getElementById('renderResult').innerHTML = '<div class="loader-container"><div class="loader"></div><p>Rendering Output...</p></div>';
        }

        const apiLayers = []; // SWITCH TO ARRAY TO GUARANTEE ORDER AND PREVENT COLLISIONS
        this.template.layers.forEach((layer, index) => {
            // Parse all values to ensure they're valid numbers
            const fontSize = this.parseFontSize(layer.fontSize);
            const letterSpacing = this.parseNumericValue(layer.letterSpacing, 0);
            const wordSpacing = this.parseNumericValue(layer.wordSpacing, 0);
            const x = this.parseNumericValue(layer.x, 0);
            const y = this.parseNumericValue(layer.y, 0);
            const width = this.parseNumericValue(layer.width, 100);
            const height = this.parseNumericValue(layer.height, 100);
            const borderWidth = this.parseNumericValue(layer.borderWidth, 0);
            const lineHeight = layer.lineHeight || 1.2;

            apiLayers.push({
                layer: layer.id, // Use unique ID for mapping
                type: layer.type,
                text: layer.text,
                image_url: layer.image_url,
                color: layer.color,
                fontSize: fontSize,
                font_size: `${fontSize}px`, // Send both formats for API compatibility
                fontWeight: layer.fontWeight || '400',
                font_weight: layer.fontWeight || '400',
                letterSpacing: letterSpacing,
                wordSpacing: wordSpacing,
                letter_spacing: letterSpacing, // Fallback for snake_case
                word_spacing: wordSpacing, // Fallback for snake_case
                lineHeight: lineHeight,
                line_height: lineHeight,
                fontFamily: layer.fontFamily || 'Inter',
                font_family: layer.fontFamily || 'Inter',
                align: layer.align || 'left',
                text_align: layer.align || 'left', // Send both camelCase and snake_case
                verticalAlign: 'top',
                vertical_align: 'top',
                padding: 0,
                margin: 0,
                padding_left: 0,
                padding_right: 0,
                padding_top: 0,
                padding_bottom: 0,
                margin_left: 0,
                margin_right: 0,
                margin_top: 0,
                margin_bottom: 0,
                box_sizing: 'border-box',
                textTransform: 'none',
                text_transform: 'none',
                overflow: 'visible',
                white_space: 'pre-wrap',
                word_wrap: 'break-word',
                x: x,
                y: y,
                width: width,
                height: layer.type === 'text' ? this.template.height : height, // Prevent vertical clipping for text
                border_width: borderWidth,
                borderWidth: borderWidth,
                border_color: layer.borderColor || '#000000',
                borderColor: layer.borderColor || '#000000',
                stroke_width: 0
            });
        });
        
        // Inject Template-level border as a synthetic top layer
        if (this.template.border && this.template.border.width > 0) {
            apiLayers.push({
                layer: 'template-border-layer',
                type: 'rectangle',
                x: 0,
                y: 0,
                width: this.template.width,
                height: this.template.height,
                background_color: 'transparent',
                border_width: this.template.border.width,
                border_color: this.template.border.color,
                box_sizing: 'border-box',
                z_index: 9999 // Ensure it's on top
            });
        }

        try {
            const response = await fetch('https://api.templated.io/v1/render', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.templatedApiKey}`
                },
                body: JSON.stringify({
                    template: this.templateId,
                    save: true, // This ensures the render is saved in your Templated.io dashboard
                    format: 'jpg',
                    layers: apiLayers
                })
            });

            const data = await response.json();
            if (response.ok) {
                if (isBackground) {
                    this.updateStatus('Render background sync complete!');
                } else {
                    const renderUrl = data.render_url;
                    document.getElementById('renderResult').innerHTML = `<img src="${renderUrl}" alt="Rendered Template">`;

                    // Setup direct download click handler
                    this.downloadBtn.onclick = async (e) => {
                        e.preventDefault();
                        this.updateStatus('Downloading...');

                        try {
                            const renderUrlObj = new URL(renderUrl);
                            let fetchUrl = renderUrl;
                            
                            // Check if running locally (dev) vs production (Vercel)
                            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                            
                            if (isLocal) {
                                // Use Vite proxy locally
                                fetchUrl = `/api/render-image${renderUrlObj.pathname}`;
                            } else {
                                // Use our own Vercel Serverless Function to proxy the image cleanly
                                fetchUrl = `/api/proxy-image?url=${encodeURIComponent(renderUrl)}`;
                            }

                            // We MUST fetch the blob first. 
                            // Browsers ignore the `download` attribute on <a> tags if the href is cross-origin.
                            // To force a download instead of a navigation, we must download the blob into memory 
                            // and generate a same-origin ObjectURL.
                            const res = await fetch(fetchUrl);
                            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

                            const blob = await res.blob();
                            const blobUrl = window.URL.createObjectURL(blob);
                            
                            const link = document.createElement('a');
                            link.href = blobUrl;
                            link.download = `${this.template.name || 'template'}.jpg`;
                            
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(blobUrl);
                            
                            this.updateStatus('Success! Download complete.');
                        } catch (err) {
                            console.error('Download failed:', err);
                            
                            // Last resort fallback: open in new tab
                            console.log('Falling back to opening in new tab.');
                            const link = document.createElement('a');
                            link.href = renderUrl;
                            link.target = '_blank';
                            link.download = `${this.template.name || 'template'}.jpg`;
                            link.click();
                            
                            this.updateStatus('Opening image... please save it manually.');
                        }
                    };


                    this.updateStatus('Render complete! Click download to save.');
                }
            } else {
                if (!isBackground) {
                    document.getElementById('renderResult').innerHTML = `<p class="error">Error: ${data.message || data.error}</p>`;
                }
                this.updateStatus('Render failed');
            }
        } catch (error) {
            this.updateStatus(`Network error: ${error.message}`);
        }
    }

    async uploadToSupabase(layerId, file) {
        if (!file) return;

        this.updateStatus('Uploading to Supabase...');
        const fileName = `${Date.now()}-${file.name}`;

        try {
            const { data, error } = await this.supabase.storage
                .from('templates')
                .upload(fileName, file);

            if (error) throw error;

            const { data: { publicUrl } } = this.supabase.storage
                .from('templates')
                .getPublicUrl(fileName);

            // Update state and refresh UI
            this.updateLayerProperty(layerId, 'image_url', publicUrl);
            this.updateStatus('Upload successful!');

            // Ensure the input field in the property panel is in sync
            const input = document.getElementById('imageUrlInput');
            if (input) {
                input.value = publicUrl;
                // Trigger a property render to show the new URL in the UI correctly
                this.renderProperties();
            }

        } catch (error) {
            this.updateStatus(`Upload error: ${error.message}`);
        }
    }

    updateStatus(msg) {
        this.statusMessage.innerText = msg;
    }

    showToast(message, icon = '🥳') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-text">${message}</span>
        `;
        this.toastContainer.appendChild(toast);

        // Auto remove after 3s
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
}

// Global instance
const app = new TemplateFlow();
window.app = app;
