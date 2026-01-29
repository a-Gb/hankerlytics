# HN Thread Atlas

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Interactive visualization tool for exploring Hacker News discussion threads. Load any thread by ID or URL and navigate complex conversations using multiple layout views, pan/zoom controls, and an optional local LLM integration for analysis.

## Features

### Visualization Layouts

- **Frontpage Mosaic** – Overview of top stories with mini icicle previews
- **Sankey** – Weighted flow view showing thread context and conversation depth
- **Tidy Tree** – Classic hierarchical tree layout
- **Icicle** – Flame-graph style overview for large threads
- **Thread Lanes** – Swimlane-style view separating top-level branches

### Navigation

- Pan and zoom with mouse/trackpad
- Click nodes to view comment details
- Double-click to collapse/expand branches
- Hover for quick comment previews

### Data Features

- Stats display: comment count, max depth, largest branch, most active author
- IndexedDB caching for recently viewed threads
- Refresh to diff new comments since last load
- Branch view showing nested replies

### Local LLM Integration (Optional)

- Send selected thread context to a local LLM endpoint
- Supports LM Studio API and OpenAI-style `/v1/responses`
- Auto-sentiment labeling for comments
- Results cached locally per branch

## Quick Start

This is a static site with no build step required. Serve it locally to avoid browser CORS restrictions:

```bash
./start-dev.sh
```

Then open `http://localhost:8080` in your browser.

Alternatively, use any static file server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

## Project Structure

```text
├── app.js                 # Main application entry point
├── index.html            # Single-page HTML
├── styles.css            # All styles (no preprocessor)
├── modules/
│   ├── cache.js          # IndexedDB caching layer
│   ├── color.js          # Lane color assignment
│   ├── config.js         # Configuration constants
│   ├── data.js           # HN API fetching & tree building
│   ├── db.js             # IndexedDB wrapper
│   ├── dom.js            # DOM element references
│   ├── focus.js          # Focus/highlight state
│   ├── frontpage.js      # Frontpage mosaic rendering
│   ├── llm.js            # Local LLM integration
│   ├── state.js          # Application state
│   ├── svg.js            # SVG element utilities
│   ├── text.js           # Text measurement & wrapping
│   ├── ui.js             # Detail panel updates
│   ├── utils.js          # General utilities
│   └── layouts/          # Visualization layouts
│       ├── index.js
│       ├── layout-frontpage.js
│       ├── layout-icicle.js
│       ├── layout-lanes.js
│       ├── layout-sankey.js
│       └── layout-tidy.js
└── scripts/
    └── prepare-release.sh
```

## Configuration

Edit `modules/config.js` to customize:

- Default thread ID
- Default LLM model
- Frontpage preview limits
- Tile sizing for mosaic view

## Browser Support

Requires a modern browser with ES modules support:

- Chrome/Edge 80+
- Firefox 78+
- Safari 14+

## Notes

- Data is fetched from the public [Hacker News Firebase API](https://github.com/HackerNews/API)
- Large threads (1000+ comments) may take several seconds to load
- LLM integration requires a local server (e.g., LM Studio) running

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT – see [LICENSE](LICENSE) for details.
