// Opens the real UI (next dev on :3000, wrangler dev on :8787) with a local session, selects a
// project and saves a full-page screenshot plus the visible text of the listings section.
// Usage: npx vite-node scripts/lab/screenshot-project.ts <projectName> <outFile.png>
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { ensureUser, readLocalSupabase } from './local-env';

const main = async () => {
  const [projectName, outFile] = process.argv.slice(2);
  if (!projectName || !outFile)
    throw new Error('Usage: screenshot-project.ts <projectName> <out.png>');
  const supabase = readLocalSupabase();
  const { accessToken, userId } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
  await page.getByText('Anúncios coletados').first().waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outFile, fullPage: true });
  const text = await page.locator('section', { hasText: 'Anúncios coletados' }).first().innerText();
  writeFileSync(outFile.replace(/\.png$/, '.txt'), text);
  await browser.close();
  console.log(`Saved ${outFile}`);
};

void main();
