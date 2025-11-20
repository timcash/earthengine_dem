import { TestState, TestTools, Page, sleep } from './test_utils';

const MAX_TIMEOUT = 5000;

export async function test(state: TestState, page: Page, tools: TestTools): Promise<void> {
    const homepage = `${state.serverUrl}/earthengine/earthengine.html`;
    await page.goto(homepage, { waitUntil: 'networkidle2' });

    tools.logger.info('Earth Engine Layers test started');

    // Wait for the page to load and the default layer image to load
    await page.waitForSelector('#layer-image', { timeout: MAX_TIMEOUT });
    tools.logger.info('Layer image element located');

    // Wait for the loading to complete (loading element should be hidden)
    await page.waitForFunction(() => {
        const loading = document.getElementById('loading');
        return loading && loading.style.display === 'none';
    }, { timeout: MAX_TIMEOUT });
    tools.logger.info('Initial DEM layer load completed');

    // Test 1: Verify initial DEM layer loads correctly
    const initialImageSrc = await page.evaluate(() => {
        const img = document.getElementById('layer-image') as HTMLImageElement;
        return img ? img.src : '';
    });

    if (!initialImageSrc || initialImageSrc === '') {
        throw new Error('Initial DEM layer image failed to load');
    }

    // Test 2: Test layer type switching to Roads
    tools.logger.info('Testing layer type change to Roads');
    
    await page.select('#layer-select', 'ROADS');
    await page.click('#load-button');
    
    // Wait for loading to complete
    await page.waitForFunction(() => {
        const loading = document.getElementById('loading');
        return loading && loading.style.display === 'none';
    }, { timeout: MAX_TIMEOUT });

    const roadsImageSrc = await page.evaluate(() => {
        const img = document.getElementById('layer-image') as HTMLImageElement;
        return img ? img.src : '';
    });

    if (!roadsImageSrc || roadsImageSrc === '') {
        throw new Error('Roads layer image failed to load');
    }

    // Test 3: Test layer type switching to DEM with Roads
    tools.logger.info('Testing layer type change to DEM with Roads');
    
    await page.select('#layer-select', 'DEM_ROADS');
    await page.click('#load-button');
    
    // Wait for loading to complete
    await page.waitForFunction(() => {
        const loading = document.getElementById('loading');
        return loading && loading.style.display === 'none';
    }, { timeout: MAX_TIMEOUT });

    const demRoadsImageSrc = await page.evaluate(() => {
        const img = document.getElementById('layer-image') as HTMLImageElement;
        return img ? img.src : '';
    });

    if (!demRoadsImageSrc || demRoadsImageSrc === '') {
        throw new Error('DEM with Roads layer image failed to load');
    }

    // Test 4: Test region change with different layer
    tools.logger.info('Testing region change to Ridgecrest, CA with DEM layer');
    
    await page.select('#region-select', 'RIDGECREST_CA');
    await page.select('#layer-select', 'DEM');
    await page.click('#load-button');
    
    // Wait for loading to complete
    await page.waitForFunction(() => {
        const loading = document.getElementById('loading');
        return loading && loading.style.display === 'none';
    }, { timeout: MAX_TIMEOUT });

    const ridgecrestImageSrc = await page.evaluate(() => {
        const img = document.getElementById('layer-image') as HTMLImageElement;
        return img ? img.src : '';
    });

    if (!ridgecrestImageSrc || ridgecrestImageSrc === '') {
        throw new Error('Ridgecrest, CA DEM image failed to load');
    }

    // Test 5: Test cache bypass functionality
    tools.logger.info('Testing cache bypass functionality');
    
    await page.evaluate(() => {
        const checkbox = document.getElementById('bypass-cache') as HTMLInputElement;
        if (checkbox) {
            checkbox.checked = true;
        }
    });
    await page.click('#load-button');
    
    // Wait for loading to complete
    await page.waitForFunction(() => {
        const loading = document.getElementById('loading');
        return loading && loading.style.display === 'none';
    }, { timeout: MAX_TIMEOUT });

    const bypassCacheImageSrc = await page.evaluate(() => {
        const img = document.getElementById('layer-image') as HTMLImageElement;
        return img ? img.src : '';
    });

    if (!bypassCacheImageSrc || bypassCacheImageSrc === '') {
        throw new Error('Cache bypass image failed to load');
    }

    // Test 6: Verify image sizing and aspect ratio
    const imageDimensions = await page.evaluate(() => {
        const img = document.getElementById('layer-image') as HTMLImageElement;
        const rect = img.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
        };
    });

    // Verify the image is displayed (dimensions > 0)
    if (imageDimensions.width === 0 || imageDimensions.height === 0) {
        throw new Error('Layer image is not displaying properly');
    }

    // Verify aspect ratio is maintained (should be close to 1:1 for 1024x1024 images)
    const aspectRatio = imageDimensions.width / imageDimensions.height;
    if (aspectRatio < 0.8 || aspectRatio > 1.2) {
        tools.logger.warn(`Image aspect ratio is ${aspectRatio.toFixed(2)}, expected close to 1.0`);
    }

    tools.logger.info('Earth Engine Layers test completed successfully');
}
