# Camping Checklist

A comprehensive web application for planning camping trips. Manage your camping gear, calculate equipment weight, track costs, and keep important trip details all in one place.

## Features

- Organize camping gear in customizable sections
- Track item weight, cost, and packed status
- Manage trip details with Google Maps location integration
- Monitor permits and regulations deadlines
- Light and dark theme support
- Drag-and-drop reordering
- Undo/redo functionality
- Search and filter capabilities
- Offline-capable with local storage

## Setup

### Prerequisites

- Modern web browser
- Google Maps API key (for location features)

### API Keys

1. Create a `keys.txt` file in the project root with your API keys:

GOOGLE_MAPS_API_KEY = "your-google-maps-api-key-here"
OPENWEATHERMAP_API_KEY = "your-openweathermap-api-key-here"

**Note:** The `keys.txt` file is ignored by Git to keep your API keys secure.

### Google Maps API

To get a Google Maps API key:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Google Maps JavaScript API and Places API
4. Create an API key and restrict it to your domains
5. Add the key to your `keys.txt` file

### Installation

1. Clone this repository
2. Create your `keys.txt` file with API keys
3. Open `index.html` in your browser or serve it with a local web server

## Development

### Scripts

- `npm test` - Run tests with Vitest
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Project Structure

- `index.html` - Main HTML file
- `camplist.js` - Application entry point
- `state.js` - State management
- `ui.js` - UI rendering and interactions
- `drag.js` - Drag-and-drop functionality
- `location.js` - Google Maps integration
- `config.js` - API key configuration
- `camplist.css` - Styles
- `camplist.json` - Default checklist template

## License

ISC

// Add this to reinitializePlaceAutocomplete in location.js
document.addEventListener('gmp-placechange', (event) => {
  console.log('Document-level gmp-placechange captured:', event);
  
  if (event.target.id === 'destinationAutocompleteElement') {
    const place = event.detail.place;
    console.log('Place selected:', place);
    // Process place...
  }
}, true); // Use capture phase