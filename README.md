# Earth Engine Layers Viewer

A standalone web application that visualizes Google Earth Engine data (DEM, Roads) with interface.

![Example Screenshot](public/images/example.png)

## Features

- **Earth Engine Integration**: Fetches real-time data from Google Earth Engine.
- **Layer Selection**: Toggle between Digital Elevation Models (DEM), Roads, or a composite view.
- **Region Selection**: Pre-defined regions like Mount Fuji, Grand Canyon, and Ridgecrest.
- **Caching**: Caches Earth Engine images locally for faster subsequent loads.

## Prerequisites

- Node.js (v18+ recommended)
- A valid Google Earth Engine private key JSON file.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Credentials**:
    **IMPORTANT:** You must obtain Google Earth Engine credentials to run this application.
    1. Create a Service Account in your Google Cloud Console with access to the Earth Engine API.
    2. Download the private key as a JSON file.
    3. Rename the file to `earthengine.json` and place it in the root directory of this project.

## Running the Application

To run both the client (Vite) and the server (Express) concurrently:

```bash
npm run dev
```

- The application will be available at `http://localhost:5173`.
- The API server runs on `http://localhost:3000`.

## Testing

To run the Puppeteer integration test:

```bash
npm test
```

This will launch a headless browser, navigate to the app, and verify that the layers load correctly.

## Project Structure

- `src/client`: Frontend code (Vite, TypeScript, CSS).
- `src/server`: Backend code (Express, Earth Engine Service).
- `public`: Static assets and cached images.
