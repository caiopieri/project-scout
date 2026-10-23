// Clicks "Exportar CSV/XLSX" in the real UI and saves both files to the given directory.
// Usage: npx vite-node scripts/lab/prove-export.ts <projectName> <outDir>
import { chromium } from 'playwright';
import { ensureUser, readLocalSupabase } from './local-env';

const main = async () => {
  const [projectName, outDir] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken, userId } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto('http://localhost:3000/');
  await page.evaluate(
    (session) => localStorage.setItem('scout.auth.session', JSON.stringify(session)),
    { access_token: accessToken, expires_in: 3600, user: { id: userId, email: 'lab@scout.local' } },
  );
  await page.reload();
  await page
    .locator('article', { hasText: projectName })
    .first()
    .getByRole('button', { name: 'Abrir' })
    .click();
  await page.locator('.feed-item').first().waitFor();
  for (const format of ['CSV', 'XLSX']) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: `Exportar ${format}` }).click(),
    ]);
    const target = `${outDir}/${download.suggestedFilename()}`;
    await download.saveAs(target);
    console.log(`saved ${target}`);
  }
  await browser.close();
};

void main();
