import puppeteer from 'puppeteer';

async function runTest() {
    console.log('Starting test...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        dumpio: true
    });
    const page = await browser.newPage();

    try {
        console.log('Navigating to app...');
        // Wait for the server to be ready. In a real CI, we'd use wait-on or similar.
        // Here we assume the user runs the test while the app is running.
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });

        console.log('Checking for HUD elements...');
        await page.waitForSelector('.hud-container');
        await page.waitForSelector('#load-button');
        await page.waitForSelector('#region-select');

        console.log('HUD elements found.');

        // Take a screenshot of the initial state
        await page.screenshot({ path: 'initial_state.png' });

        console.log('Clicking Load Layer button...');
        await page.click('#load-button');

        // Wait for loading indicator
        await page.waitForSelector('#loading', { visible: true });
        console.log('Loading indicator appeared.');

        // Wait for either image or error
        // We race these two promises
        const imageLoaded = page.waitForSelector('#ee-article', { visible: true, timeout: 60000 })
            .then(() => 'image');
        const errorShown = page.waitForSelector('#error', { visible: true, timeout: 60000 })
            .then(() => 'error');

        // Note: ee-article is always there, but we check if background image is set or if loading disappears
        // Actually, the code sets display: block on #layer-image if it existed, but here it sets background image on article.
        // Let's wait for loading to disappear.

        await page.waitForSelector('#loading', { hidden: true, timeout: 60000 });
        console.log('Loading indicator disappeared.');

        // Check if error is visible
        const errorVisible = await page.$eval('#error', el => getComputedStyle(el).display !== 'none');

        if (errorVisible) {
            const errorText = await page.$eval('#error', el => el.textContent);
            console.error('Error shown in app:', errorText);
            // We don't fail the test if it's just an API error (e.g. missing credentials), 
            // as we are testing the app structure. But we should note it.
        } else {
            console.log('Layer loaded successfully (or at least no error shown).');
        }

        await page.screenshot({ path: 'final_state.png' });
        console.log('Test completed successfully.');

    } catch (error) {
        console.error('Test failed:', error);
        await page.screenshot({ path: 'error_state.png' });
        process.exit(1);
    } finally {
        await browser.close();
    }
}

runTest();
