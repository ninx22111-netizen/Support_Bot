// Smoke test: spawn `node index.js` with no DISCORD_TOKEN and assert
// the documented missing-token error path. This guards the cold-boot
// behavior staff rely on each maintenance cycle ("the bot exits 1 with
// a clear error if you forget to set DISCORD_TOKEN").
//
// Usage: `npm test`
//
// The test spawns the main entrypoint as a child process so the real
// `client.login()` is exercised exactly the way Render runs it; it is
// not a unit test and does not hit the Discord API. It deliberately
// blanks DISCORD_TOKEN / GUILD_ID / STAFF_ROLE_ID in the child's env
// so the assertions are stable on a developer machine that has those
// set in `.env` — see the comment on `childEnv` below for why we set
// them to '' instead of `delete`-ing them.

const { spawn } = require('child_process');
const path = require('path');

const ENTRY = path.join(__dirname, '..', 'index.js');

const cases = [
    {
        name: 'exits 1 with missing-token error when DISCORD_TOKEN is unset',
        env: {}, // all three creds stripped
        expectStderr: /No bot token found/,
    },
    {
        name: 'exits 1 with missing-guild error when only DISCORD_TOKEN is set',
        env: { DISCORD_TOKEN: 'fake-token-for-smoke-test' },
        expectStderr: /No guild ID found/,
    },
    {
        name: 'exits 1 with missing-staff-role error when token+guild are set',
        env: { DISCORD_TOKEN: 'fake-token-for-smoke-test', GUILD_ID: '0' },
        expectStderr: /No staff role IDs found/,
    },
];

function runCase(c) {
    return new Promise((resolve, reject) => {
        // Blank the three creds in the parent env, then layer on the
        // case's overrides. We set to '' instead of `delete`-ing because
        // index.js calls `require('dotenv').config()` on startup, which
        // by default only fills *undefined* env vars — so deleting them
        // would let dotenv re-populate from a real `.env` and defeat the
        // isolation. An empty string is *defined* (so dotenv leaves it
        // alone) but still falsy for the validation block in index.js.
        const childEnv = { ...process.env };
        childEnv.DISCORD_TOKEN = '';
        childEnv.GUILD_ID = '';
        childEnv.STAFF_ROLE_ID = '';
        Object.assign(childEnv, c.env);

        const child = spawn(process.execPath, [ENTRY], {
            env: childEnv,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderr = '';
        let stdout = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

        // Hard timeout: the bot should exit very quickly on the missing-
        // creds path. If it doesn't, the smoke test has caught a real
        // regression (e.g. someone removed the early `process.exit(1)`).
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(
                `Timed out waiting for index.js to exit on case "${c.name}". ` +
                `Stderr so far: ${stderr.trim()}`
            ));
        }, 10_000);

        child.on('exit', (code) => {
            clearTimeout(timeout);
            if (code !== 1) {
                reject(new Error(
                    `Expected exit code 1, got ${code} on case "${c.name}".\n` +
                    `Stderr:\n${stderr}\nStdout:\n${stdout}`
                ));
                return;
            }
            if (!c.expectStderr.test(stderr)) {
                reject(new Error(
                    `Expected stderr to match ${c.expectStderr} on case "${c.name}".\n` +
                    `Got stderr:\n${stderr}`
                ));
                return;
            }
            resolve();
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

(async () => {
    let failed = 0;
    for (const c of cases) {
        try {
            await runCase(c);
            console.log(`ok - ${c.name}`);
        } catch (err) {
            failed++;
            console.error(`not ok - ${c.name}`);
            console.error(`  ${err.message.split('\n').join('\n  ')}`);
        }
    }
    if (failed > 0) {
        console.error(`\n${failed} test(s) failed.`);
        process.exit(1);
    }
    console.log(`\nAll ${cases.length} smoke test(s) passed.`);
})();
