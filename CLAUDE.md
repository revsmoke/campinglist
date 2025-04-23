# Claude Code Assistant Notes

## Project Information
- **Project Name**: Camping Checklist
- **Description**: Web application for organizing camping trips and gear
- **Main Files**:
  - `index.html` - Main HTML file
  - `camplist.js` - Application entry point
  - `state.js` - State management
  - `ui.js` - UI rendering
  - `location.js` - Google Maps integration
  - `drag.js` - Drag-and-drop functionality
  - `config.js` - API key management

## Commands
- `npm test` - Run tests with Vitest
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Important Notes
- API keys are stored in `keys.txt` (gitignored) and loaded via `config.js`
- Google Maps API is used for location features
- The app uses localStorage for data persistence
- UI includes light/dark theme toggle

## Implementation Details
- State management is handled in `state.js` with functions for CRUD operations
- UI rendering is managed by functions in `ui.js`
- Google Maps integration uses the Places API for location autocomplete
- Drag-and-drop functionality is implemented in `drag.js`

## Future Reference
- Always run `npm run lint` before committing changes
- Remember to check `ROADMAP.md` for planned features and implementation status
- The app supports undo/redo functionality via state history stack