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
            border: { width: 0, color: '#000000' },
            layers: []
        };
        this.selectedLayerIds = new Set();
        this.clipboard = [];
        this.scale = 0.5;

        this.init();
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
        // Start with an empty canvas as requested
        this.template.layers = [];
        this.render();

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
        this.renderClose = document.querySelector('.close');
        this.templatesClose = document.getElementById('templatesClose');
        this.templatesList = document.getElementById('templatesList');
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
    }

    calculateScale() {
        if (!this.workspace) return 0.5;
        const padding = window.innerWidth < 768 ? 40 : 100;
        const availableWidth = this.workspace.clientWidth - padding;
        const availableHeight = this.workspace.clientHeight - padding;

        const scaleX = availableWidth / this.template.width;
        const scaleY = availableHeight / this.template.height;

        // Take the smaller scale to fit both dimensions
        this.scale = Math.min(scaleX, scaleY, 1.0);
        // Minimum scale to keep it usable
        this.scale = Math.max(this.scale, 0.2);

        return this.scale;
    }

    loadInitialLayers() {
        const defaultLayers = [
            { layer: "text-center-1", type: "text", text: "HEADING", x: 450, y: 120, width: 300, height: 60, fontSize: 40, align: "center" },
            { layer: "line1-text", type: "text", text: "Line 1 Content", x: 80, y: 260, width: 820, height: 160, fontSize: 42, color: "#1a1a1a" },
            { layer: "line1-image", type: "image", image_url: "https://via.placeholder.com/160", x: 960, y: 260, width: 160, height: 160 },
            { layer: "line2-text", type: "text", text: "Line 2 Content", x: 80, y: 520, width: 820, height: 160, fontSize: 42, color: "#1a1a1a" },
            { layer: "line2-image", type: "image", image_url: "https://via.placeholder.com/160", x: 960, y: 520, width: 160, height: 160 }
        ];

        this.template.layers = defaultLayers.map((l, i) => ({ ...l, id: `layer-${Date.now()}-${i}` }));
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
            lineHeight: 1.2,
            align: 'left',
            color: '#1a1a1a'
        } : {
            id,
            layer: `image-${this.template.layers.length + 1}`,
            type: 'image',
            image_url: 'https://via.placeholder.com/200',
            x: 100,
            y: 100,
            width: 200,
            height: 200
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
            if (['x', 'y', 'width', 'height', 'fontSize'].includes(prop)) {
                value = parseInt(value) || 0;
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
            newLayer.id = `layer-${Date.now()}-${Math.random()}`;
            newLayer.layer = `${newLayer.layer}-copy`;
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
        this.calculateScale();
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
            el.style.left = `${layer.x * this.scale}px`;
            el.style.top = `${layer.y * this.scale}px`;
            el.style.width = `${layer.width * this.scale}px`;
            el.style.height = `${layer.height * this.scale}px`;
            el.style.zIndex = isSelected ? '100' : '10';

            if (layer.type === 'text') {
                el.style.fontSize = `${layer.fontSize * this.scale}px`;
                el.style.fontWeight = layer.fontWeight || '400';
                el.style.letterSpacing = `${(layer.letterSpacing || 0) * this.scale}px`;
                el.style.lineHeight = layer.lineHeight || '1.2';
                el.style.color = layer.color || '#000000';
                el.style.textAlign = layer.align || 'left';
                el.style.display = 'flex';
                el.style.alignItems = (layer.align === 'center') ? 'center' : 'flex-start';
                el.style.justifyContent = (layer.align === 'center') ? 'center' : (layer.align === 'right' ? 'flex-end' : 'flex-start');
                el.style.fontFamily = layer.fontFamily || 'Inter';
                el.innerText = layer.text;
                el.style.wordBreak = 'break-word';
                el.style.whiteSpace = 'pre-wrap'; // Preserve paragraph spacing
                el.style.lineHeight = '1.2';
            } else if (layer.type === 'image') {
                const img = document.createElement('img');
                img.src = layer.image_url;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                el.appendChild(img);
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

        const selectedId = Array.from(this.selectedLayerIds)[0];
        const layer = this.template.layers.find(l => l.id === selectedId);
        let html = `
            <div class="property-group">
                <label>Layer Name</label>
                <input type="text" value="${layer.layer}" onkeyup="app.updateLayerProperty('${layer.id}', 'layer', this.value)">
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
                        <select onchange="app.updateLayerProperty('${layer.id}', 'fontWeight', this.value)">
                            <option value="300" ${layer.fontWeight == '300' ? 'selected' : ''}>Light</option>
                            <option value="400" ${layer.fontWeight == '400' ? 'selected' : ''}>Regular</option>
                            <option value="600" ${layer.fontWeight == '600' ? 'selected' : ''}>Semi-Bold</option>
                            <option value="700" ${layer.fontWeight == '700' ? 'selected' : ''}>Bold</option>
                        </select>
                    </div>
                    <div class="property-group">
                        <label>Spacing</label>
                        <input type="number" step="0.1" value="${layer.letterSpacing || 0}" oninput="app.updateLayerProperty('${layer.id}', 'letterSpacing', this.value, true)">
                    </div>
                    <div class="property-group">
                        <label>L. Height</label>
                        <input type="number" step="0.1" value="${layer.lineHeight || 1.2}" oninput="app.updateLayerProperty('${layer.id}', 'lineHeight', this.value, true)">
                    </div>
                </div>
                <div class="property-group">
                    <label>Font Family</label>
                    <select onchange="app.updateLayerProperty('${layer.id}', 'fontFamily', this.value)">
                        <option value="Inter" ${layer.fontFamily === 'Inter' ? 'selected' : ''}>Inter (Sans)</option>
                        <option value="Montserrat" ${layer.fontFamily === 'Montserrat' ? 'selected' : ''}>Montserrat (Modern)</option>
                        <option value="Roboto" ${layer.fontFamily === 'Roboto' ? 'selected' : ''}>Roboto (Clean)</option>
                        <option value="Playfair Display" ${layer.fontFamily === 'Playfair Display' ? 'selected' : ''}>Playfair (Elegant)</option>
                        <option value="Lora" ${layer.fontFamily === 'Lora' ? 'selected' : ''}>Lora (Classic Serif)</option>
                        <option value="Courier New" ${layer.fontFamily === 'Courier New' ? 'selected' : ''}>Monospace</option>
                    </select>
                </div>
                <div class="property-group">
                    <label>Alignment</label>
                    <select onchange="app.updateLayerProperty('${layer.id}', 'align', this.value)">
                        <option value="left" ${layer.align === 'left' ? 'selected' : ''}>Left</option>
                        <option value="center" ${layer.align === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right" ${layer.align === 'right' ? 'selected' : ''}>Right</option>
                    </select>
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

        const apiLayers = this.template.layers.map(({ id, ...rest }) => rest);
        const payload = {
            name: this.template.name || "Untitled Template",
            width: this.template.width,
            height: this.template.height,
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
        // Create a visual representation of layers in the card
        const layers = tpl.layers ? (Array.isArray(tpl.layers) ? tpl.layers : Object.values(tpl.layers)) : [];
        if (layers.length === 0) return '<div class="empty-preview">Empty Template</div>';

        const scale = 140 / Math.max(tpl.width, tpl.height);
        const elements = layers.slice(0, 10).map(l => {
            const style = `
                position: absolute;
                left: ${(l.x || 0) * scale}px;
                top: ${(l.y || 0) * scale}px;
                width: ${(l.width || 50) * scale}px;
                height: ${(l.height || 20) * scale}px;
                background: ${l.type === 'image' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
                border: 1px solid rgba(255,255,255,0.05);
                font-size: 2px;
                overflow: hidden;
            `;
            return `<div style="${style}"></div>`;
        }).join('');

        return `<div class="mini-artboard" style="width: ${tpl.width * scale}px; height: ${tpl.height * scale}px;">${elements}</div>`;
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
        this.template.width = tpl.width;
        this.template.height = tpl.height;

        // Deep clone layers from the template
        if (tpl.layers) {
            // Templated API returns layers as objects if it was saved via API.
            // If layers is an array, we map it. If it's an object (v1/template response structure), we handle it.
            const layers = Array.isArray(tpl.layers) ? tpl.layers : Object.values(tpl.layers || {});

            this.template.layers = layers.map((l, i) => ({
                ...l,
                id: l.id || `loaded-layer-${Date.now()}-${i}`,
                // Ensure default props for older saved templates
                x: l.x || 0,
                y: l.y || 0,
                width: l.width || 200,
                height: l.height || 100,
                type: l.type || (l.text ? 'text' : 'image')
            }));
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

        const apiLayers = {};
        this.template.layers.forEach((layer, index) => {
            // Fallback for layer name if it's missing, using index
            const layerName = layer.layer || `layer-${index + 1}`;

            apiLayers[layerName] = {
                text: layer.text,
                image_url: layer.image_url,
                color: layer.color,
                fontSize: layer.fontSize,
                fontWeight: layer.fontWeight,
                letterSpacing: layer.letterSpacing,
                lineHeight: layer.lineHeight,
                fontFamily: layer.fontFamily,
                x: layer.x,
                y: layer.y,
                width: layer.width,
                height: layer.height
            };
        });

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
                            // On Vercel/Production, the direct fetch might fail due to CORS.
                            // We try the download but provide a clear fallback if it fails.
                            const response = await fetch(renderUrl, { mode: 'cors' });
                            if (!response.ok) throw new Error('CORS issue');

                            const blob = await response.blob();
                            const blobUrl = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = blobUrl;
                            link.download = `${this.template.name || 'template'}.jpg`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(blobUrl);
                            this.updateStatus('Success! Check your downloads.');
                        } catch (err) {
                            console.log('Direct download blocked by CORS, opening in new tab.');
                            // Fallback: If CORS blocks the fetch, we open the link in a new tab
                            // The user can right-click > "Save Image As" or it might trigger auto-view.
                            const link = document.createElement('a');
                            link.href = renderUrl;
                            link.target = '_blank';
                            link.download = `${this.template.name || 'template'}.jpg`; // Might be ignored by browser for cross-origin
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

            this.updateLayerProperty(layerId, 'image_url', publicUrl);
            this.updateStatus('Upload successful!');

            const input = document.getElementById('imageUrlInput');
            if (input) input.value = publicUrl;

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
