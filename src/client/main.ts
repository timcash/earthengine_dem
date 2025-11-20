// Earth Engine Layers viewer client-side code
// This will communicate with a backend API to get different layer data

interface Region {
    west: number;
    south: number;
    east: number;
    north: number;
    name: string;
}

interface ElevationStats {
    min: number;
    max: number;
    mean: number;
}

type LayerType = 'DEM' | 'ROADS' | 'DEM_ROADS';

const REGIONS: Record<string, Region> = {
    FUJI: {
        west: 138.65,
        south: 35.25,
        east: 138.85,
        north: 35.45,
        name: 'Mount Fuji'
    },
    GRAND_CANYON: {
        west: -112.3,
        south: 36.0,
        east: -111.9,
        north: 36.4,
        name: 'Grand Canyon'
    },
    RIDGECREST_CA: {
        west: -118.4,
        south: 35.4,
        east: -117.4,
        north: 36.4,
        name: 'Ridgecrest, CA'
    }
};

async function loadLayerImage(regionKey: string, layerType: LayerType, bypassCache: boolean): Promise<void> {
    const loadingEl = document.getElementById('loading')!;
    const errorEl = document.getElementById('error')!;
    const imageEl = document.getElementById('layer-image') as HTMLImageElement | null;
    const statsEl = document.getElementById('stats')!;
    const loadButton = document.getElementById('load-button') as HTMLButtonElement;
    const articleEl = document.getElementById('ee-article') as HTMLElement | null;

    // Show loading state
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    if (imageEl) imageEl.style.display = 'none';
    statsEl.style.display = 'none';
    loadButton.disabled = true;

    try {
        const region = REGIONS[regionKey];
        if (!region) {
            throw new Error(`Unknown region: ${regionKey}`);
        }

        // Determine API endpoint based on layer type
        let endpoint: string;
        switch (layerType) {
            case 'DEM':
                endpoint = '/api/earthengine/dem';
                break;
            case 'ROADS':
                endpoint = '/api/earthengine/roads';
                break;
            case 'DEM_ROADS':
                endpoint = '/api/earthengine/dem';
                break;
            default:
                throw new Error(`Unknown layer type: ${layerType}`);
        }

        // Call backend API to get layer thumbnail and stats
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                region: {
                    west: region.west,
                    south: region.south,
                    east: region.east,
                    north: region.north
                },
                width: 1024,
                height: 1024,
                skipCache: bypassCache,
                demOnly: layerType === 'DEM'
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Display the image and set background on the article
        if (imageEl) {
            imageEl.src = data.thumbnailUrl;
            imageEl.alt = `${layerType} of ${region.name}`;
            imageEl.style.display = 'block';
        }
        if (articleEl) {
            articleEl.style.backgroundImage = `url(${data.thumbnailUrl})`;
            articleEl.style.backgroundSize = 'cover';
            articleEl.style.backgroundPosition = 'center';
        }

        // Display statistics (only for DEM layers)
        if (data.stats && layerType !== 'ROADS') {
            const stats: ElevationStats = data.stats;
            document.getElementById('stat-min')!.textContent = stats.min.toFixed(1);
            document.getElementById('stat-max')!.textContent = stats.max.toFixed(1);
            document.getElementById('stat-mean')!.textContent = stats.mean.toFixed(1);
            statsEl.style.display = 'block';
        } else {
            statsEl.style.display = 'none';
        }

        // Update info text
        const infoEl = document.getElementById('info')!;
        switch (layerType) {
            case 'DEM':
                infoEl.textContent = 'Digital Elevation Model (DEM) data';
                break;
            case 'ROADS':
                infoEl.textContent = 'OpenStreetMap road data';
                break;
            case 'DEM_ROADS':
                infoEl.textContent = 'DEM elevation data with OpenStreetMap road overlay';
                break;
        }

        loadingEl.style.display = 'none';
    } catch (error) {
        console.error('Error loading layer image:', error);
        errorEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errorEl.style.display = 'block';
        loadingEl.style.display = 'none';
    } finally {
        loadButton.disabled = false;
    }
}

// Initialize function
function initializeEarthEngine() {
    const loadButton = document.getElementById('load-button') as HTMLButtonElement;
    const regionSelect = document.getElementById('region-select') as HTMLSelectElement;
    const layerSelect = document.getElementById('layer-select') as HTMLSelectElement;
    const bypassCacheCheckbox = document.getElementById('bypass-cache') as HTMLInputElement;

    if (loadButton && regionSelect && layerSelect && bypassCacheCheckbox) {
        loadButton.addEventListener('click', (event) => {
            event.preventDefault();
            const selectedRegion = regionSelect.value;
            const selectedLayer = layerSelect.value as LayerType;
            const bypassCache = bypassCacheCheckbox.checked;
            loadLayerImage(selectedRegion, selectedLayer, bypassCache);
        });

        // Set defaults to Ridgecrest, CA and DEM with Roads
        regionSelect.value = 'RIDGECREST_CA';
        layerSelect.value = 'DEM_ROADS';
        loadLayerImage('RIDGECREST_CA', 'DEM_ROADS', false);
    }
}

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEarthEngine);
} else {
    initializeEarthEngine();
}
