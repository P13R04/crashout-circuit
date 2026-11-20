/** Lance le salon local HTTP et HTTPS depuis npm, y compris sous Windows. */
const solo = process.argv.includes('--solo');
process.env.CRASHOUT_LOCAL_NETWORK = '1';
process.env.CRASHOUT_LOCAL_HTTPS_PORT ??= solo ? '3443' : '3444';
process.env.PORT ??= solo ? '3000' : '3001';
if (solo) {
  process.env.CRASHOUT_SOLO_TEST = '1';
  process.env.CRASHOUT_DEV_TOOLS = '1';
}
await import('../dist/server/index.js');
