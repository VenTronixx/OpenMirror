/**
 * Shared auto-fit helper for OpenMirror modules.
 *
 * Dynamically scales a main text element so it fills the module container,
 * while keeping optional sub elements proportionally sized.
 *
 * Usage:
 *   import { fitText } from '../shared/autoFit.js';
 *
 *   fitText({
 *     container,
 *     main: '.my-main-value',
 *     sub: ['.my-label', '.my-detail'],
 *     scale: config.fontScale || 1,
 *     mainRatio: 0.7,
 *     subRatio: 0.28
 *   });
 *
 * Options:
 *   - container:   the module wrapper element
 *   - main:        CSS selector for the main text element
 *   - sub:         CSS selector or array of selectors for secondary text
 *   - scale:       multiplier applied to the computed size (e.g. fontScale)
 *   - mainRatio:   how much of the available height the main text may use (0-1)
 *   - subRatio:    sub text size as a ratio of the main text size
 *   - widthRatio:  approximate width of the main text in font-size units
 */

export function fitText({
  container,
  main,
  sub = [],
  scale = 1,
  mainRatio = 0.7,
  subRatio = 0.28,
  widthRatio = null
}) {
  if (!container) return null;

  const mainEl = container.querySelector(main);
  if (!mainEl) return null;

  const subSelectors = Array.isArray(sub) ? sub : [sub];
  const subEls = subSelectors
    .map(s => typeof s === 'string' ? container.querySelector(s) : s)
    .filter(Boolean);

  function fit() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    const subCount = subEls.length;
    const reservedHeight = height * 0.04 + subCount * height * 0.18;
    const availableHeight = Math.max(height * 0.3, height - reservedHeight);

    let byWidth;
    if (widthRatio != null) {
      byWidth = (width * 0.9) / Math.max(1, widthRatio);
    } else {
      const text = mainEl.textContent || '88';
      const charRatio = Math.max(1, text.length * 0.6);
      byWidth = (width * 0.9) / charRatio;
    }

    const byHeight = availableHeight * mainRatio;
    const mainSize = Math.max(10, Math.min(byWidth, byHeight)) * scale;

    mainEl.style.fontSize = `${mainSize}px`;

    subEls.forEach(el => {
      el.style.fontSize = `${mainSize * subRatio}px`;
    });
  }

  fit();

  let ro = null;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(fit);
    ro.observe(container);
  }

  return {
    fit,
    destroy() {
      if (ro) ro.disconnect();
    }
  };
}

/**
 * Set a base font size on a container so child elements sized in em/rem scale together.
 * Useful for list/grid modules like Calendar.
 */
export function fitBaseSize({
  container,
  scale = 1,
  ratio = 0.06
}) {
  if (!container) return null;

  function fit() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    const base = Math.max(10, Math.min(width, height) * ratio) * scale;
    container.style.fontSize = `${base}px`;
  }

  fit();

  let ro = null;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(fit);
    ro.observe(container);
  }

  return {
    fit,
    destroy() {
      if (ro) ro.disconnect();
    }
  };
}
