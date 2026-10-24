// Simulated Swappa redesigns of the recorded page, for self-heal tests and drills. The listing
// data stays the same; only the markup tokens the parser depends on change.
export type SwappaRedesign = 'renamed' | 'renamed-cents';

export const redesignSwappaPage = (html: string, variant: SwappaRedesign) => {
  const renamed = html
    .replace(/class="xui_card_slots"/g, 'class="sw-results-grid"')
    .replace(/xui_card_wrapper/g, 'sw-listing-tile')
    .replace(/(\s)data-code=/g, '$1data-sku-code=')
    .replace(/(\s)data-price=/g, '$1data-list-price=');
  return variant === 'renamed-cents'
    ? renamed.replace(
        /data-list-price="(\d+)(?:\.(\d{1,2}))?"/g,
        (_match, dollars: string, cents = '0') =>
          `data-list-price="${Number(dollars) * 100 + Number(cents.padEnd(2, '0'))}"`,
      )
    : renamed;
};

/** The same page with the grid still there but no cards in it (a source that went empty). */
export const emptySwappaPage = (html: string) =>
  redesignSwappaPage(html, 'renamed').replace(/class="sw-listing-tile[^"]*"/g, 'class="sw-gone"');

/** The recorded page with the first card's price lowered (a seller dropping the price). */
export const cheaperSwappaPage = (html: string, fromDollars = 195, toDollars = 149) =>
  html
    .replace(`data-price="${fromDollars}"`, `data-price="${toDollars}"`)
    .replace(
      `<span itemprop="price">${fromDollars}</span>`,
      `<span itemprop="price">${toDollars}</span>`,
    );
