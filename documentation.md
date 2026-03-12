# TemplateFlow Documentation

TemplateFlow is a professional, modern web application for creating, managing, and rendering design templates. It leverages the **Templated.io API** for high-quality image generation and **Supabase** for cloud-based asset storage.

## 🚀 Key Features

### 🎨 Design Editor
- **Dynamic Canvas**: A responsive workspace that auto-scales based on your screen size.
- **Layer Management**: Add, move, resize, and delete text and image layers.
- **Rich Properties**: Customize typography (fonts, weights, spacing, alignment) and image sources (URL or direct upload).
- **Marquee selection**: Drag to select multiple layers at once.
- **Keyboard Shortcuts**:
    - `Ctrl+C` / `Ctrl+V`: Copy and Paste layers.
    - `Ctrl+D`: Duplicate selected layers.
    - `Delete` / `Backspace`: Remove layers.
    - `Ctrl+A`: Select all layers.

### 📂 Template Management
- **Visual Gallery**: Browse your saved designs with generated mini-previews.
- **Full Overwrite (PUT)**: Updating a template uses `replaceLayers=true` to ensure the server design matches your editor perfectly.
- **Save as Copy**: Create variations of existing templates without losing the original.
- **Cloud Delete**: Remotely delete templates from the Templated.io dashboard directly from the UI.
- **Persistent State**: Automated sync between the UI and API state.

### 🖼️ Rendering & Assets
- **One-Click Render**: Generate high-resolution JPGs via the Templated.io API.
- **Direct Download**: Cross-origin handled downloading of rendered outputs.
- **Supabase Integration**: Direct file upload support for image layers, automatically storing assets in Supabase Storage and syncing the public URL back to your design.

---

## 🛠️ Technical Stack

- **Frontend**: Vanilla Javascript (ES6+), HTML5, CSS3.
- **Styling**: Premium Glassmorphism design system with CSS Variables.
- **Backend-as-a-Service**:
    - [Templated.io](https://templated.io): Template storage and image generation.
    - [Supabase](https://supabase.com): Image hosting and file storage.

---

## ⚙️ Setup & Installation

1. **Clone the project** to your local machine.
2. **Environment Variables**: Create a `.env` file in the root directory and add your credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_TEMPLATED_API_KEY=your_templated_io_api_key
   ```
3. **Install Dependencies**:
   ```bash
   npm install
   ```
4. **Run Locally**:
   ```bash
   npm run dev
   ```

---

## 📖 API Usage reference

### Create/Update Template
The app dynamically chooses between `POST` and `PUT` based on the existence of a `templateId`.

```javascript
// PUT /v1/template/{id}?replaceLayers=true
const response = await fetch(url, {
    method: this.templateId ? 'PUT' : 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
        name: template.name,
        width: template.width,
        height: template.height,
        layers: apiLayers // Standardised Templated.io layer objects
    })
});
```

---

## 💎 Design System

TemplateFlow uses a custom-built **Glassmorphism** system:
- **`--glass-bg`**: `rgba(255, 255, 255, 0.05)`
- **`--glass-border`**: `rgba(255, 255, 255, 0.1)`
- **`--primary-color`**: `#6366f1` (Indigo accent)
- **`--bg-dark`**: `#0f172a` (Sleek navy background)

---

## 📝 License
Proprietary design for TemplateFlow Project.
