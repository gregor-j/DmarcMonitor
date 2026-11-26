const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

async function exercisePasskeys(page, url, password) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: {
            protocol: 'ctap2',
            transport: 'internal',
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
        },
    });

    const name = page.getByLabel('Passkey name');
    const addPasskey = page.getByRole('button', { name: 'Add passkey' });
    await name.fill('Browser test passkey');
    await addPasskey.click();
    await page.waitForURL(target => target.pathname === '/confirm-password');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.waitForURL('**/profile');

    await name.fill('Browser test passkey');
    await addPasskey.click();
    await page.getByText('Browser test passkey', { exact: true }).waitFor();

    await page.context().clearCookies();
    await page.goto(new URL('/login', url).href);
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
    await page.waitForURL('**/dashboard');
}

async function main() {
    const url = new URL(process.argv[2]);
    assert.equal(url.hostname, 'localhost', 'Use a seeded local test instance on localhost.');
    const { CSP_TEST_EMAIL, CSP_TEST_PASSWORD, CHROMIUM_EXECUTABLE } = process.env;
    assert.ok(CSP_TEST_EMAIL && CSP_TEST_PASSWORD, 'Set the disposable test account via the environment.');

    const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
    const errors = [];
    try {
        const page = await browser.newPage({ serviceWorkers: 'block', colorScheme: 'light' });
        page.setDefaultTimeout(7500);
        const record = message => errors.push(message.split('\n')[0].replace(/'nonce-[^']+'/g, "'nonce-…'"));
        page.on('pageerror', error => record(error.message));
        page.on('console', message => {
            if (/Content Security Policy|(?:Alpine|Livewire) Expression Error/.test(message.text())) {
                record(message.text());
            }
        });

        const response = await page.goto(new URL('/login', url).href);
        assert.equal(response.status(), 200);
        assert.match(await response.headerValue('content-security-policy'), /(?:^|;)\s*script-src 'self' 'nonce-[^']+';/);

        await page.locator('#email').fill(CSP_TEST_EMAIL);
        await page.locator('#password').fill(CSP_TEST_PASSWORD);
        await page.getByRole('button', { name: 'Log in', exact: true }).click();
        await page.waitForURL('**/dashboard');
        await page.waitForFunction(() => {
            const canvases = [...document.querySelectorAll('main canvas')];
            return canvases.length === 2 && canvases.every(canvas => window.Chart?.getChart(canvas));
        });
        const chartVolume = await page.evaluate(() => window.Chart.getChart(document.querySelector('main canvas'))
            .data.datasets.at(-1).data.reduce((total, count) => total + count, 0));

        const domains = page.getByRole('button', { name: 'All domains' });
        await domains.click();
        const search = page.getByPlaceholder('Search…').filter({ visible: true });
        await search.fill('example.org');
        const update = page.waitForResponse(response => response.request().method() === 'POST'
            && /\/livewire(?:-[^/]+)?\/update$/.test(new URL(response.url()).pathname));
        await search.press('Enter');
        assert.equal((await update).status(), 200);
        await page.getByRole('button', { name: 'example.org', exact: true }).waitFor();
        await page.waitForFunction(original => window.Chart.getChart(document.querySelector('main canvas'))
            .data.datasets.at(-1).data.reduce((total, count) => total + count, 0) < original, chartVolume);

        await page.getByRole('button', { name: 'Switch to dark mode' }).click();
        await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
        await page.getByRole('link', { name: 'Help', exact: true }).click();
        await page.waitForURL('**/help');
        const helpSearch = page.getByPlaceholder('Search help topics…');
        await helpSearch.fill('no-matching-topic');
        await page.getByText('No help topics match your search.').waitFor();
        await helpSearch.fill('dmarc');
        await page.locator('main a[href*="/help/"]').first().waitFor({ state: 'visible' });

        await page.goto(new URL('/admin/expected-sources?match_type=helo_domain&match_value=mx.example.org', url).href);
        const matchValue = page.locator('input[wire\\:model="match_value"]');
        await matchValue.waitFor();
        assert.equal(await matchValue.inputValue(), 'mx.example.org');
        await page.keyboard.press('Escape');
        await matchValue.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'New Expected Source' }).click();
        await matchValue.waitFor();
        assert.equal(await matchValue.inputValue(), '');

        await page.goto(new URL('/profile', url).href);
        const saveProfile = page.locator('form[wire\\:submit="updateProfileInformation"]');
        await saveProfile.getByLabel('Name').fill('Browser test account');
        await saveProfile.getByRole('button', { name: 'Save', exact: true }).click();
        await saveProfile.getByText('Saved.', { exact: true }).waitFor();

        await exercisePasskeys(page, url, CSP_TEST_PASSWORD);
        assert.deepEqual([...new Set(errors)], [], 'Browser errors under the enforced CSP');
    } catch (error) {
        if (errors.length && !error.message.includes('Browser errors under the enforced CSP')) {
            error.message += `\nBrowser errors:\n${[...new Set(errors)].join('\n')}`;
        }
        throw error;
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    let message = error.message.replace(/'nonce-[^']+'/g, "'nonce-…'");
    for (const value of [process.env.CSP_TEST_EMAIL, process.env.CSP_TEST_PASSWORD].filter(Boolean)) {
        message = message.replaceAll(value, '<redacted>');
    }
    console.error(message);
    process.exitCode = 1;
});
