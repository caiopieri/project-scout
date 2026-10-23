// Uses the agent panel in the real UI: asks a question, applies the agent's filter to the list,
// opens a cited listing in the dossier, then asks for a spending action and confirms it.
// Usage: npx vite-node scripts/lab/prove-agent-ui.ts <projectName> <outPrefix>
import { chromium } from 'playwright';
import { ensureUser, readLocalSupabase } from './local-env';

const main = async () => {
  const [projectName, outPrefix] = process.argv.slice(2);
  const supabase = readLocalSupabase();
  const { accessToken, userId } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
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
  await page.getByRole('button', { name: 'Perguntar ao agente' }).click();
  await page
    .locator('textarea[placeholder^="Ex."]')
    .fill('Quantos iPhone 13 usados (condição Used) têm custo total abaixo de US$ 300? Cite.');
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await page.getByText('Filtro aplicado pelo agente').waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Aplicar na lista' }).first().click();
  await page.waitForTimeout(2500);
  const headline = await page
    .locator('.results-head', { hasText: 'Anúncios coletados' })
    .first()
    .innerText();
  await page.screenshot({ path: `${outPrefix}-agent.png`, fullPage: false });
  await page.locator('button.badge').first().click();
  await page.locator('.drawer').waitFor({ timeout: 15_000 });
  const dossierTitle = await page.locator('.drawer h3').innerText();
  await page.keyboard.press('Escape');
  await page
    .locator('textarea[placeholder^="Ex."]')
    .fill('Dispare uma nova coleta desta pesquisa.');
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await page.getByText('Confirmação necessária').waitFor({ timeout: 60_000 });
  const confirmation = await page
    .locator('.notice', { hasText: 'Confirmação necessária' })
    .innerText();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Confirmado:').waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${outPrefix}-confirm.png`, fullPage: false });
  await browser.close();
  console.log(JSON.stringify({ headline, dossierTitle, confirmation }, null, 2));
};

void main();
