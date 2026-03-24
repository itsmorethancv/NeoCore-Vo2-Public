# Features Directory

This directory contains self-contained capabilities for the NeoCore-o2 system.
Both Python backend logic and React frontend UI code are co-located in each feature's subfolder.

## Structure
Each feature folder (e.g., `timer/`, `stopwatch/`) typically contains:
- `__init__.py`: Makes the folder a Python package for `python/main.py`.
- `*.py`: Backend logic, WebSocket handlers, and state management.
- `*.tsx`: React components for the Electron frontend.
- `index.ts`: Exports frontend components to be consumed by `src/App.tsx`.

## Importing
- **Backend (Python)**: The project root is added to `sys.path` in `main.py`, so you can just `from features.X import Y`.
- **Frontend (TS/TSX)**: Vite and TypeScript are configured with an `@features` alias. In `src/App.tsx` or other components, import like `import { MyComponent } from '@features/X'`. Always export through the top-level `features/index.ts`.
