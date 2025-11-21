import { EarthEngineService } from './server/earthengine_service';
import { join } from 'path';

const port = 3000;

const eeService = new EarthEngineService({
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

Bun.serve({
    port,
    async fetch(req) {
        const url = new URL(req.url);

        // API Routes
        if (url.pathname === '/api/earthengine/dem' && req.method === 'POST') {
            try {
                const body = await req.json();
                const { region, width, height, skipCache, demOnly } = body;

                if (!region) {
                    return new Response(JSON.stringify({ error: 'Region is required' }), { status: 400 });
                }

                let thumbnailUrl: string;
                if (demOnly) {
                    thumbnailUrl = await eeService.getDEMThumbnail(region, width, height, { skipCache, demOnly: true });
                } else {
                    thumbnailUrl = await eeService.getDEMThumbnail(region, width, height, { skipCache, demOnly: false });
                }

                const stats = await eeService.getElevationStats(region, { skipCache });

                return new Response(JSON.stringify({ thumbnailUrl, stats }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error('Error in /api/earthengine/dem:', error);
                return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500 });
            }
        }

        if (url.pathname === '/api/earthengine/roads' && req.method === 'POST') {
            try {
                const body = await req.json();
                const { region, width, height, skipCache } = body;

                if (!region) {
                    return new Response(JSON.stringify({ error: 'Region is required' }), { status: 400 });
                }

                const thumbnailUrl = await eeService.getRoadsThumbnail(region, width, height, { skipCache });

                return new Response(JSON.stringify({ thumbnailUrl }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error('Error in /api/earthengine/roads:', error);
                return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500 });
            }
        }

        // Static File Serving
        let filePath = url.pathname;
        if (filePath === '/') {
            filePath = '/src/client/index.html';
        }

        // Handle main.ts bundling
        if (filePath === '/main.ts') {
            try {
                const build = await Bun.build({
                    entrypoints: [join(process.cwd(), 'src/client/main.ts')],
                    target: 'browser',
                    minify: false,
                });

                if (build.success) {
                    return new Response(build.outputs[0]);
                } else {
                    console.error('Build failed:', build.logs);
                    return new Response('Build failed', { status: 500 });
                }
            } catch (err) {
                console.error('Build error:', err);
                return new Response('Build error', { status: 500 });
            }
        }

        // Try serving from src/client first (for source files)
        let file = Bun.file(join(process.cwd(), filePath.startsWith('/') ? filePath.slice(1) : filePath));

        // If not found, check if it's in src/client (e.g. requesting /styles.css but it's in src/client/styles.css)
        if (!await file.exists()) {
            const clientPath = join(process.cwd(), 'src', 'client', filePath.startsWith('/') ? filePath.slice(1) : filePath);
            file = Bun.file(clientPath);
        }

        // If still not found, check public (e.g. /images/...)
        if (!await file.exists()) {
            const publicPath = join(process.cwd(), 'public', filePath.startsWith('/') ? filePath.slice(1) : filePath);
            file = Bun.file(publicPath);
        }

        if (await file.exists()) {
            return new Response(file);
        }

        return new Response('Not Found', { status: 404 });
    },
});

console.log(`Server running at http://localhost:${port}`);
