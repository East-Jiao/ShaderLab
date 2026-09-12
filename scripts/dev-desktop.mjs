// 桌面开发模式：启动 vite dev server，就绪后拉起 Electron
import { spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';

const PORT = 5173;
const URL = `http://localhost:${PORT}`;

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('vite dev server 启动超时'));
      else setTimeout(probe, 400);
    };
    probe();
  });
}

const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
});

let electronProc = null;
try {
  await waitForServer(URL);
  electronProc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, VITE_DEV_SERVER_URL: URL },
  });
} catch (err) {
  console.error(err);
  vite.kill();
  process.exit(1);
}

const cleanup = () => {
  vite.kill();
  if (electronProc) electronProc.kill();
  process.exit(0);
};
electronProc?.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
