# Visual Companion Guide

When a grilling question involves UI layout, component design, navigation structure, or any visual/spatial decision, create an HTML prototype so the user can **see** the options instead of just reading about them. Output is HTML only — never markdown, never any other format.

## Hard skip rule

If the session has no frontend/UI/visual surface — backend work, domain modeling, terminology sharpening, ADR-only discussions, infrastructure, data pipelines — do NOT offer or mention the visual companion at all. Stay in text the entire session, and do not create the `designs/` subfolder under the session folder. The companion exists for visual decisions only; bringing it up in a non-visual session adds noise.

## The test

For sessions that DO have a frontend/visual surface, decide per-question: **"would the user understand this better by seeing it than reading it?"**

**Show a prototype** for: UI mockups, wireframes, layouts, navigation structures, component designs, side-by-side visual comparisons, design polish, spatial relationships, state machines, flowcharts.

**Stay in text** for: requirements/scope questions, conceptual A/B/C choices, tradeoff lists, technical decisions, terminology, clarifying questions.

A question *about* a UI topic is not automatically a visual question. "What kind of wizard do you want?" is conceptual — stay in text. "Which of these wizard layouts feels right?" is visual — show a prototype.

## Offering the visual companion

Only offer when the session passes the hard skip rule above AND the topic will likely have visual questions (frontend feature, UI redesign, component library, etc.). Offer it early — as its own standalone message before continuing with questions:

> "This topic will involve some layout/UI decisions. I can show you visual mockups as we go — want me to do that?"

If declined, stay text-only. If accepted, use prototypes whenever the per-question test says "show it."

## How it works

1. Write a self-contained HTML file to `<project-root>/.scratch/grill-with-docs/{YYYY-MM-DD}-{topic-slug}/designs/{screen-name}.html`. Use the **same session folder** as the markdown capture file (`notes.md` sits at the session-folder root; HTML mockups live under `designs/` inside it). Find the project root with `git rev-parse --show-toplevel`. The `designs/` folder is HTML-only — never write markdown there. Create it lazily on first write.
2. Open it so the user can see it (see **Displaying prototypes** below).
3. Give a brief text summary in chat and ask the user to respond.
4. For iterations, write a new versioned file (e.g. `layout-v2.html`, `layout-v3.html`) — never overwrite.
5. When moving back to text-only questions, mention "continuing in chat" so the user knows the preview is no longer active.

## Displaying prototypes

Use whichever method is available in the current environment. Try them in this order:

1. **`show_preview` tool** (Valo) — if available, use it. Renders the HTML directly in the right panel, no browser needed.
2. **Open in default browser** — use the platform command to open the HTML file (paths relative to project root, replace `{session}` with the actual session folder name):
   - macOS: `open .scratch/grill-with-docs/{session}/designs/layout.html`
   - Windows: `start .scratch/grill-with-docs/{session}/designs/layout.html`
   - Linux: `xdg-open .scratch/grill-with-docs/{session}/designs/layout.html`
3. **Tell the user the path** — if neither works (sandbox restrictions, remote environment), tell the user the file path and ask them to open it manually.

For iterations (v2, v3…), open the new file the same way. The browser opens a new tab or replaces the current one — either is fine.

## Writing prototypes

Write full self-contained HTML documents. Include all CSS inline. No external dependencies — the file must work when opened directly from disk.

Use this CSS foundation (light/dark theme aware):

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{Screen Title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg-primary: #f5f5f7; --bg-secondary: #ffffff; --bg-tertiary: #e5e5e7;
      --border: #d1d1d6; --text-primary: #1d1d1f; --text-secondary: #86868b;
      --text-tertiary: #aeaeb2; --accent: #0071e3; --success: #34c759;
      --warning: #ff9f0a; --error: #ff3b30;
      --selected-bg: #e8f4fd; --selected-border: #0071e3;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-primary: #1d1d1f; --bg-secondary: #2d2d2f; --bg-tertiary: #3d3d3f;
        --border: #424245; --text-primary: #f5f5f7; --text-secondary: #86868b;
        --text-tertiary: #636366; --accent: #0a84ff;
        --selected-bg: rgba(10,132,255,0.15); --selected-border: #0a84ff;
      }
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary); color: var(--text-primary);
      line-height: 1.5; padding: 2rem;
    }
    h2 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
    h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: var(--text-secondary); margin-bottom: 1.5rem; }
    .section { margin-bottom: 2rem; }
    .label { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }

    /* Options (A/B/C choices) */
    .options { display: flex; flex-direction: column; gap: 0.75rem; }
    .option {
      background: var(--bg-secondary); border: 2px solid var(--border); border-radius: 12px;
      padding: 1rem 1.25rem; display: flex; align-items: flex-start; gap: 1rem;
    }
    .option .letter {
      background: var(--bg-tertiary); color: var(--text-secondary);
      width: 1.75rem; height: 1.75rem; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.85rem; flex-shrink: 0;
    }
    .option .content { flex: 1; }
    .option .content h3 { font-size: 0.95rem; margin-bottom: 0.15rem; }
    .option .content p { color: var(--text-secondary); font-size: 0.85rem; margin: 0; }

    /* Cards (design mockups) */
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
    .card {
      background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
    }
    .card-image { background: var(--bg-tertiary); aspect-ratio: 16/10; display: flex; align-items: center; justify-content: center; }
    .card-body { padding: 1rem; }
    .card-body h3 { margin-bottom: 0.25rem; }
    .card-body p { color: var(--text-secondary); font-size: 0.85rem; }

    /* Mockup container */
    .mockup { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 1.5rem; }
    .mockup-header { background: var(--bg-tertiary); padding: 0.5rem 1rem; font-size: 0.75rem; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
    .mockup-body { padding: 1.5rem; }

    /* Split view (side-by-side) */
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

    /* Pros/Cons */
    .pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
    .pros, .cons { background: var(--bg-secondary); border-radius: 8px; padding: 1rem; }
    .pros h4 { color: var(--success); font-size: 0.85rem; margin-bottom: 0.5rem; }
    .cons h4 { color: var(--error); font-size: 0.85rem; margin-bottom: 0.5rem; }
    .pros ul, .cons ul { margin-left: 1.25rem; font-size: 0.85rem; color: var(--text-secondary); }

    /* Wireframe building blocks */
    .mock-nav { background: var(--accent); color: white; padding: 0.75rem 1rem; display: flex; gap: 1.5rem; font-size: 0.9rem; }
    .mock-sidebar { background: var(--bg-tertiary); padding: 1rem; min-width: 180px; }
    .mock-content { padding: 1.5rem; flex: 1; }
    .mock-button { background: var(--accent); color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.85rem; }
    .mock-input { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem; width: 100%; }
    .placeholder { background: var(--bg-tertiary); border: 2px dashed var(--border); border-radius: 8px; padding: 2rem; text-align: center; color: var(--text-tertiary); }
  </style>
</head>
<body>
  <!-- Content here -->
</body>
</html>
```

## Available CSS classes

| Class | Use for |
|-------|---------|
| `.options` > `.option` | A/B/C choice cards with `.letter` + `.content` |
| `.cards` > `.card` | Visual design cards with `.card-image` + `.card-body` |
| `.mockup` | Wireframe container with `.mockup-header` + `.mockup-body` |
| `.split` | Side-by-side comparison (two `.mockup` children) |
| `.pros-cons` > `.pros` / `.cons` | Pro/con lists with colored headers |
| `.mock-nav` | Fake navigation bar |
| `.mock-sidebar` | Fake sidebar |
| `.mock-content` | Main content area |
| `.mock-button` | Fake button |
| `.mock-input` | Fake input field |
| `.placeholder` | Dashed placeholder area |

## Design tips

- Scale fidelity to the question — a rough wireframe for layout, polished mockup for visual style.
- Present 2–4 options max per screen.
- Use real content when it matters (real labels, realistic data) — placeholder content obscures design issues.
- Each page should explain the question it's asking — add a title and subtitle.
