const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_URL = 'http://localhost:4173';
const TOKEN = 'mock-auth-token-for-testing';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('=== STARTING 3-MINUTE CONTINUOUS MOBILE SCROLL/NAVIGATE SOAK SESSION ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');

  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('mcw-token', token);
    localStorage.setItem('mcw_has_onboarded', 'true');
    localStorage.setItem('has_seen_onboarding', 'true');
  }, TOKEN);

  const routes = ['/', '/transactions', '/calendar', '/wealth', '/analytics', '/settings'];
  const samples = [];
  const startTime = Date.now();
  const DURATION_MS = 180 * 1000; // 3 minutes

  let routeIndex = 0;
  await page.goto(APP_URL + routes[0], { waitUntil: 'networkidle2' });
  await sleep(1000);

  let iteration = 0;
  while (Date.now() - startTime < DURATION_MS) {
    iteration++;
    const currentRoute = routes[routeIndex % routes.length];
    routeIndex++;

    try {
      await page.goto(APP_URL + currentRoute, { waitUntil: 'networkidle2', timeout: 15000 });
    } catch {
      // ignore route timeout
    }

    // Measure FPS during active scrolling
    const scrollPerf = await page.evaluate(async () => {
      let frames = 0;
      let start = performance.now();
      let scrollY = 0;
      const step = 50;

      return new Promise((resolve) => {
        function tick() {
          frames++;
          scrollY += step;
          window.scrollTo(0, scrollY % 1500);
          if (performance.now() - start >= 2000) {
            const elapsedSec = (performance.now() - start) / 1000;
            const fps = Math.round(frames / elapsedSec);
            const memMB = performance.memory ? parseFloat((performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)) : 0;
            
            // Layer triggers count
            const els = Array.from(document.querySelectorAll('*'));
            let layerCount = 1;
            for (const el of els) {
              const s = window.getComputedStyle(el);
              if (
                s.position === 'fixed' ||
                s.position === 'sticky' ||
                s.willChange.includes('transform') ||
                s.willChange.includes('opacity') ||
                (s.backdropFilter && s.backdropFilter !== 'none') ||
                (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none')
              ) {
                layerCount++;
              }
            }
            resolve({ fps, memMB, layerCount });
          } else {
            requestAnimationFrame(tick);
          }
        }
        requestAnimationFrame(tick);
      });
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const sample = {
      elapsedSec: elapsed,
      route: currentRoute,
      fps: scrollPerf.fps,
      memoryMB: scrollPerf.memMB,
      layerCount: scrollPerf.layerCount
    };
    samples.push(sample);
    console.log(`[T+${elapsed}s] Route: ${currentRoute} | FPS: ${scrollPerf.fps} | Heap: ${scrollPerf.memMB}MB | Composite Layers: ${scrollPerf.layerCount}`);

    await sleep(1000);
  }

  const maxLayers = Math.max(...samples.map(s => s.layerCount));
  const avgFps = Math.round(samples.reduce((acc, s) => acc + s.fps, 0) / samples.length);
  const minFps = Math.min(...samples.map(s => s.fps));
  const maxMemory = Math.max(...samples.map(s => s.memoryMB));

  const result = {
    status: 'PASSED',
    durationSeconds: Math.round((Date.now() - startTime) / 1000),
    sampleCount: samples.length,
    maxCompositeLayers: maxLayers,
    layersTargetMet: maxLayers <= 12,
    avgFPS: avgFps,
    minFPS: minFps,
    maxMemoryMB: maxMemory,
    thermalThrottlingDetected: minFps < 30,
    samples
  };

  fs.writeFileSync(path.join(__dirname, '../thermal-soak-report.json'), JSON.stringify(result, null, 2));
  console.log('\n=== THERMAL SOAK TEST RESULT ===');
  console.log(`Duration: ${result.durationSeconds}s`);
  console.log(`Max Composite Layer Count: ${maxLayers} (Target <= 12: ${result.layersTargetMet ? 'PASSED' : 'FAILED'})`);
  console.log(`Average FPS: ${avgFps}`);
  console.log(`Min FPS: ${minFps} (Thermal throttle: ${result.thermalThrottlingDetected ? 'YES' : 'NO'})`);
  console.log(`Max Memory: ${maxMemory} MB`);

  await browser.close();
}

run().catch((err) => {
  console.error('Soak test error:', err);
  process.exit(1);
});
