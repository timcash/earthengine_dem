import type { Page as PuppeteerPage } from 'puppeteer';
import type { Logger } from '../log';

// Test utility functions for slideshow tests
export interface TestState {
    serverUrl?: string; // Vite server URL (e.g., "http://localhost:5173")
    [key: string]: any;
}

export interface TestTools {
    logger: Logger;
}

// Use Puppeteer's Page type directly
export type Page = PuppeteerPage;

interface SlideInfo {
    title: string | null;
    current: number;
    total: number;
}

// Global test name for logging
let currentTestName: string = 'unknown';

export function setTestName(name: string): void {
    currentTestName = name;
}

export function sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export function logTestStep(step: string, message: string): void {
    console.log(`  ${step} ${message}`);
}

export async function waitForElement(page: Page, selector: string, timeout: number = 5000): Promise<boolean> {
    try {
        await page.waitForSelector(selector, { timeout });
        return true;
    } catch (error) {
        throw new Error(`Element ${selector} not found within ${timeout}ms`);
    }
}

export async function getSlideInfo(page: Page): Promise<SlideInfo> {
    const title = await page.$eval('#slide-title', (el: Element) => el.textContent);
    const current = await page.$eval('#current-slide', (el: Element) => el.textContent);
    const total = await page.$eval('#total-slides', (el: Element) => el.textContent);
    
    return { 
        title, 
        current: parseInt(current || '0'), 
        total: parseInt(total || '0') 
    };
}

export async function navigateToSlide(page: Page, targetSlide: number): Promise<void> {
    const { current, total } = await getSlideInfo(page);
    
    if (targetSlide < 1 || targetSlide > total) {
        throw new Error(`Invalid slide number: ${targetSlide}. Must be between 1 and ${total}`);
    }
    
    // Navigate to target slide
    let currentSlide = current;
    while (currentSlide !== targetSlide) {
        if (currentSlide < targetSlide) {
            await page.click('#next-btn');
        } else {
            await page.click('#prev-btn');
        }
        await sleep(300);
        
        const newInfo = await getSlideInfo(page);
        currentSlide = newInfo.current;
        if (currentSlide === targetSlide) break;
    }
}

export async function resetToHome(page: Page, serverUrl: string): Promise<void> {
    await page.goto(serverUrl);
    await waitForElement(page, '#load-btn');
}

export async function goToDashboard(page: Page): Promise<void> {
    await page.click('a[href="/dashboard"]');
    await waitForElement(page, '#add-slide-form');
}

export async function goToHome(page: Page): Promise<void> {
    await page.click('a[href="/"]');
    await waitForElement(page, '#load-btn');
}
