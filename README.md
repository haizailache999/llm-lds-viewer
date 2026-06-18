# LLM-LDS Viewer

Static GitHub Pages viewer for LLM-LDS generated checkpoint results.

The site is self-contained:

- `index.html`
- `app.js`
- `styles.css`
- `data/`
- `assets/`

No local Python server is needed after GitHub Pages publishes this repository.

## GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose branch **main** and folder **/ (root)**, then save.
5. After a minute or two, open `https://haizailache999.github.io/llm-lds-viewer/`.

## Updating data

Rebuild viewer data from an LLM-LDS run with `build_viewer_data.py` in the main project, then copy the generated `viewer/` output into this repository and push again.
