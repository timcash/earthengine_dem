import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { EarthEngineService } from './earthengine_service';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(join(process.cwd(), 'public')));

const eeService = new EarthEngineService({
    // Key file is expected in the root directory
    keyFilePath: join(process.cwd(), 'earthengine.json'),
    cacheDir: join(process.cwd(), 'public', 'images', 'earthengine'),
    skipCache: false
});

// Initialize Earth Engine
eeService.initialize().then(() => {
    console.log('Earth Engine Service initialized');
}).catch(err => {
    console.error('Failed to initialize Earth Engine Service:', err);
});

app.post('/api/earthengine/dem', async (req, res) => {
    try {
        const { region, width, height, skipCache, demOnly } = req.body;

        if (!region) {
            return res.status(400).json({ error: 'Region is required' });
        }

        let url: string;
        if (demOnly) {
            url = await eeService.getDEMThumbnail(region, width, height, { skipCache, demOnly: true });
        } else {
            url = await eeService.getDEMThumbnail(region, width, height, { skipCache, demOnly: false });
        }

        // Get stats if available
        const stats = await eeService.getElevationStats(region, { skipCache });

        res.json({
            thumbnailUrl: url,
            stats
        });
    } catch (error) {
        console.error('Error in /api/earthengine/dem:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

app.post('/api/earthengine/roads', async (req, res) => {
    try {
        const { region, width, height, skipCache } = req.body;

        if (!region) {
            return res.status(400).json({ error: 'Region is required' });
        }

        const url = await eeService.getRoadsThumbnail(region, width, height, { skipCache });

        res.json({
            thumbnailUrl: url
        });
    } catch (error) {
        console.error('Error in /api/earthengine/roads:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
