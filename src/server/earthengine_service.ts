import ee from '@google/earthengine';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// Simple logger interface replacement
interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const consoleLogger: Logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`)
};

export interface EarthEngineConfig {
  keyFilePath?: string;
  cacheDir?: string;
  logger?: Logger;
  skipCache?: boolean;
}

type CacheOptions = {
  skipCache?: boolean;
  demOnly?: boolean; // Return DEM without roads overlay
};

interface CacheEntry {
  imageFilename?: string;
  compositeImageFilename?: string;
  roadsImageFilename?: string;
  stats?: {
    min: number;
    max: number;
    mean: number;
  };
  timestamp: number;
}

interface CacheMetadata {
  [key: string]: CacheEntry;
}

function authenticateAsync(privateKey: any): Promise<void> {
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => resolve(),
      (error: Error) => reject(new Error(`Failed to authenticate: ${error.message}`))
    );
  });
}

function initializeAsync(): Promise<void> {
  return new Promise((resolve, reject) => {
    ee.initialize(
      null,
      null,
      () => resolve(),
      (error: Error) => reject(new Error(`Failed to initialize Earth Engine: ${error.message}`))
    );
  });
}

function evaluateAsync<T>(computedObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    computedObject.evaluate((result: T, error: any) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

export class EarthEngineService {
  private initialized = false;
  private cacheDir: string;
  private cacheMetadataPath: string;
  private cacheMetadata: CacheMetadata = {};
  private logger: Logger | null = null;

  constructor(private config: EarthEngineConfig = {}) {
    this.cacheDir = config.cacheDir || join(process.cwd(), 'public', 'images', 'earthengine');
    this.cacheMetadataPath = join(this.cacheDir, 'dem_cache.json');
    this.logger = config.logger || consoleLogger;
    this.loadCacheMetadata();
  }

  private loadCacheMetadata(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    if (existsSync(this.cacheMetadataPath)) {
      try {
        const data = readFileSync(this.cacheMetadataPath, 'utf-8');
        this.cacheMetadata = JSON.parse(data);
      } catch (error) {
        this.logger?.warn(`Failed to load cache metadata, starting with empty cache: ${error}`);
        this.cacheMetadata = {};
      }
    }
  }

  private saveCacheMetadata(): void {
    try {
      writeFileSync(this.cacheMetadataPath, JSON.stringify(this.cacheMetadata, null, 2));
    } catch (error) {
      this.logger?.error(`Failed to save cache metadata: ${error}`);
    }
  }

  private getCacheKey(
    region: {
      west: number;
      south: number;
      east: number;
      north: number;
    },
    width: number,
    height: number
  ): string {
    const data = `${region.west},${region.south},${region.east},${region.north},${width},${height}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private shouldSkipCache(options?: CacheOptions): boolean {
    return options?.skipCache ?? this.config.skipCache ?? false;
  }

  private async downloadImage(url: string, filepath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    writeFileSync(filepath, buffer);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const keyPath = this.config.keyFilePath || join(process.cwd(), 'earthengine.json');
    const privateKey = JSON.parse(readFileSync(keyPath, 'utf-8'));

    await authenticateAsync(privateKey);
    await initializeAsync();

    this.initialized = true;
  }

  private async createCompositeThumbnail(
    region: {
      west: number;
      south: number;
      east: number;
      north: number;
    },
    width: number = 512,
    height: number = 512
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('EarthEngineService not initialized. Call initialize() first.');
    }

    const dataset = ee.ImageCollection('JAXA/ALOS/AW3D30/V4_1');
    const elevation = dataset.select('DSM').mosaic();

    let roadsVisualization: ee.Image;
    try {
      const roads = ee.FeatureCollection('TIGER/2016/Roads').filterBounds(
        ee.Geometry.Rectangle([
          region.west,
          region.south,
          region.east,
          region.north
        ])
      );

      // Filter roads by type using MTFCC codes
      const primaryRoads = roads.filter(ee.Filter.eq('mtfcc', 'S1100')); // Primary roads (highways)
      const secondaryRoads = roads.filter(ee.Filter.eq('mtfcc', 'S1200')); // Secondary roads
      const localRoads = roads.filter(ee.Filter.eq('mtfcc', 'S1400')); // Local roads

      // Style major roads (primary + secondary) in black
      const majorRoads = primaryRoads.merge(secondaryRoads).style({
        color: '000000',
        width: 2,
        lineType: 'solid'
      });

      // Style minor roads (local) in darker grey
      const minorRoads = localRoads.style({
        color: '404040',
        width: 1,
        lineType: 'solid'
      });

      // Combine major and minor roads
      roadsVisualization = majorRoads.blend(minorRoads);
    } catch (error) {
      this.logger?.warn(`Failed to load roads data: ${error}`);
      roadsVisualization = ee.Image
        .constant([0, 0, 0])
        .updateMask(ee.Image.constant(0));
    }

    const demVis = {
      min: 0,
      max: 5000,
      palette: ['0000ff', '00ffff', 'ffff00', 'ff0000', 'ffffff']
    };

    const composite = elevation.visualize(demVis).blend(roadsVisualization);

    const thumbnailUrl = composite.getThumbURL({
      region: [
        [region.west, region.south],
        [region.east, region.south],
        [region.east, region.north],
        [region.west, region.north],
        [region.west, region.south]
      ],
      dimensions: [width, height],
      format: 'png'
    });

    return thumbnailUrl;
  }

  async getRoadsThumbnail(
    region: {
      west: number;
      south: number;
      east: number;
      north: number;
    },
    width: number = 512,
    height: number = 512,
    options: CacheOptions = {}
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('EarthEngineService not initialized. Call initialize() first.');
    }

    const skipCache = this.shouldSkipCache(options);
    const cacheKey = `${this.getCacheKey(region, width, height)}_roads`;
    const cached = this.cacheMetadata[cacheKey];
    const cachedRoadsFile = cached?.roadsImageFilename;

    if (!skipCache && cachedRoadsFile) {
      const cachedPath = join(this.cacheDir, cachedRoadsFile);
      if (existsSync(cachedPath)) {
        this.logger?.info(`Cache hit for roads thumbnail: ${cacheKey}`);
        return `/images/earthengine/${cachedRoadsFile}`;
      }
    }

    if (skipCache) {
      this.logger?.info(`Cache bypassed for roads thumbnail: ${cacheKey}`);
    } else {
      this.logger?.info(`Cache miss for roads thumbnail: ${cacheKey}, fetching from Earth Engine...`);
    }

    const regionGeometry = ee.Geometry.Rectangle([
      region.west,
      region.south,
      region.east,
      region.north
    ]);

    const roads = ee.FeatureCollection('TIGER/2016/Roads').filterBounds(regionGeometry);

    // Filter roads by type using MTFCC codes
    const primaryRoads = roads.filter(ee.Filter.eq('mtfcc', 'S1100')); // Primary roads (highways)
    const secondaryRoads = roads.filter(ee.Filter.eq('mtfcc', 'S1200')); // Secondary roads
    const localRoads = roads.filter(ee.Filter.eq('mtfcc', 'S1400')); // Local roads

    // Style major roads (primary + secondary) in black
    const majorRoads = primaryRoads.merge(secondaryRoads).style({
      color: '000000',
      width: 2,
      lineType: 'solid'
    });

    // Style minor roads (local) in darker grey
    const minorRoads = localRoads.style({
      color: '404040',
      width: 1,
      lineType: 'solid'
    });

    // Combine major and minor roads
    const roadsVisualization = majorRoads.blend(minorRoads);

    const thumbnailUrl = roadsVisualization.getThumbURL({
      region: [
        [region.west, region.south],
        [region.east, region.south],
        [region.east, region.north],
        [region.west, region.north],
        [region.west, region.south]
      ],
      dimensions: [width, height],
      format: 'png'
    });

    const roadsImageFilename = `roads_${cacheKey}.png`;
    const roadsImagePath = join(this.cacheDir, roadsImageFilename);
    await this.downloadImage(thumbnailUrl, roadsImagePath);

    this.cacheMetadata[cacheKey] = {
      roadsImageFilename,
      timestamp: Date.now()
    };
    this.saveCacheMetadata();

    return `/images/earthengine/${roadsImageFilename}`;
  }

  async getDEMThumbnail(
    region: {
      west: number;
      south: number;
      east: number;
      north: number;
    },
    width: number = 512,
    height: number = 512,
    options: CacheOptions = {}
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('EarthEngineService not initialized. Call initialize() first.');
    }

    const skipCache = this.shouldSkipCache(options);
    const cacheKey = this.getCacheKey(region, width, height);
    const cached = this.cacheMetadata[cacheKey];

    const demOnly = options.demOnly ?? false;

    if (!skipCache && cached) {
      const { imageFilename, compositeImageFilename } = cached;

      if (!demOnly && compositeImageFilename) {
        const compositePath = join(this.cacheDir, compositeImageFilename);
        if (existsSync(compositePath)) {
          this.logger?.info(`Cache hit for DEM composite thumbnail: ${cacheKey}`);
          return `/images/earthengine/${compositeImageFilename}`;
        }
      }

      if (imageFilename) {
        const imagePath = join(this.cacheDir, imageFilename);
        if (existsSync(imagePath)) {
          this.logger?.info(`Cache hit for DEM thumbnail: ${cacheKey}`);
          return `/images/earthengine/${imageFilename}`;
        }
      }
    }

    if (skipCache) {
      this.logger?.info(`Cache bypassed for DEM thumbnail: ${cacheKey}`);
    } else {
      this.logger?.info(`Cache miss for DEM thumbnail: ${cacheKey}, fetching from Earth Engine...`);
    }

    const dataset = ee.ImageCollection('JAXA/ALOS/AW3D30/V4_1');
    const elevation = dataset.select('DSM').mosaic();
    const visParams = {
      min: 0,
      max: 5000,
      palette: ['0000ff', '00ffff', 'ffff00', 'ff0000', 'ffffff']
    };
    const demThumbnailUrl = elevation.getThumbURL({
      region: [
        [region.west, region.south],
        [region.east, region.south],
        [region.east, region.north],
        [region.west, region.north],
        [region.west, region.south]
      ],
      dimensions: [width, height],
      format: 'png',
      ...visParams
    });

    const imageFilename = `dem_${cacheKey}.png`;
    const imagePath = join(this.cacheDir, imageFilename);
    await this.downloadImage(demThumbnailUrl, imagePath);

    if (demOnly) {
      const stats = await this.getElevationStats(region, { skipCache: true });
      this.cacheMetadata[cacheKey] = {
        imageFilename,
        stats,
        timestamp: Date.now()
      };
      this.saveCacheMetadata();
      return `/images/earthengine/${imageFilename}`;
    }

    try {
      this.logger?.info('Creating composite thumbnail with DEM and roads...');
      const compositeThumbnailUrl = await this.createCompositeThumbnail(region, width, height);

      const compositeImageFilename = `dem_roads_${cacheKey}.png`;
      const compositeImagePath = join(this.cacheDir, compositeImageFilename);
      this.logger?.info(`Downloading composite image to: ${compositeImagePath}`);
      await this.downloadImage(compositeThumbnailUrl, compositeImagePath);

      const stats = await this.getElevationStats(region, { skipCache: true });
      this.cacheMetadata[cacheKey] = {
        imageFilename,
        compositeImageFilename,
        stats,
        timestamp: Date.now()
      };
      this.saveCacheMetadata();

      return `/images/earthengine/${compositeImageFilename}`;
    } catch (error) {
      this.logger?.warn(`Failed to create composite image with roads: ${error}`);
      this.logger?.warn(`Error details: ${error instanceof Error ? error.message : String(error)}`);

      const dataset = ee.ImageCollection('JAXA/ALOS/AW3D30/V4_1');
      const elevation = dataset.select('DSM').mosaic();
      const visParams = {
        min: 0,
        max: 5000,
        palette: ['0000ff', '00ffff', 'ffff00', 'ff0000', 'ffffff']
      };
      const thumbnailUrl = elevation.getThumbURL({
        region: [
          [region.west, region.south],
          [region.east, region.south],
          [region.east, region.north],
          [region.west, region.north],
          [region.west, region.south]
        ],
        dimensions: [width, height],
        format: 'png',
        ...visParams
      });

      const imageFilename = `dem_${cacheKey}.png`;
      const imagePath = join(this.cacheDir, imageFilename);
      await this.downloadImage(thumbnailUrl, imagePath);

      const stats = await this.getElevationStats(region, { skipCache: true });
      this.cacheMetadata[cacheKey] = {
        imageFilename,
        stats,
        timestamp: Date.now()
      };
      this.saveCacheMetadata();

      return `/images/earthengine/${imageFilename}`;
    }
  }

  async getElevationStats(
    region: {
      west: number;
      south: number;
      east: number;
      north: number;
    },
    options: CacheOptions = {}
  ): Promise<{
    min: number;
    max: number;
    mean: number;
  }> {
    if (!this.initialized) {
      throw new Error('EarthEngineService not initialized. Call initialize() first.');
    }

    const skipCache = this.shouldSkipCache(options);
    const cacheKey = this.getCacheKey(region, 800, 600);
    const cached = this.cacheMetadata[cacheKey];

    if (!skipCache && cached && cached.stats) {
      this.logger?.info(`Cache hit for elevation stats: ${cacheKey}`);
      return cached.stats;
    }

    if (skipCache) {
      this.logger?.info(`Cache bypassed for elevation stats: ${cacheKey}`);
    } else {
      this.logger?.info(`Cache miss for elevation stats: ${cacheKey}, fetching from Earth Engine...`);
    }

    const dataset = ee.ImageCollection('JAXA/ALOS/AW3D30/V4_1');
    const elevation = dataset.select('DSM').mosaic();

    const regionGeometry = ee.Geometry.Rectangle([
      region.west,
      region.south,
      region.east,
      region.north
    ]);

    const stats = elevation.reduceRegion({
      reducer: ee.Reducer.minMax().combine({
        reducer2: ee.Reducer.mean(),
        sharedInputs: true
      }),
      geometry: regionGeometry,
      scale: 1000,
      maxPixels: 1e9
    });

    const result = await evaluateAsync<any>(stats);

    const elevationStats = {
      min: result.DSM_min,
      max: result.DSM_max,
      mean: result.DSM_mean
    };

    if (!skipCache) {
      if (this.cacheMetadata[cacheKey]) {
        this.cacheMetadata[cacheKey].stats = elevationStats;
      } else {
        this.cacheMetadata[cacheKey] = {
          imageFilename: '',
          stats: elevationStats,
          timestamp: Date.now()
        };
      }
      this.saveCacheMetadata();
    }

    return elevationStats;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const EXAMPLE_REGIONS = {
  EVEREST: {
    west: 86.8,
    south: 27.8,
    east: 87.2,
    north: 28.2,
    name: 'Mount Everest'
  },
  GRAND_CANYON: {
    west: -112.3,
    south: 36.0,
    east: -111.9,
    north: 36.4,
    name: 'Grand Canyon'
  },
  FUJI: {
    west: 138.65,
    south: 35.25,
    east: 138.85,
    north: 35.45,
    name: 'Mount Fuji'
  },
  RIDGECREST_CA: {
    west: -118.4,
    south: 35.4,
    east: -117.4,
    north: 36.4,
    name: 'Ridgecrest, CA'
  }
};
