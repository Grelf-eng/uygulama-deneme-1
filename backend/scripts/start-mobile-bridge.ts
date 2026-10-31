import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.join(rootDir, 'backend');
const mobileDir = path.join(rootDir, 'mobile');
const linksFile = path.join(backendDir, 'data', 'mobile-links.json');

function getLanIp(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        return iface.address;
      }
    }
  }
  return '192.168.1.31';
}

const lanIp = getLanIp();
let currentTunnelUrl: string | null = null;
let currentExpoUrl = `exp://${lanIp}:8081`;
let expoProc: ChildProcess | null = null;
let expoStartedWithUrl: string | null = null;

function saveLinks(): void {
  fs.mkdirSync(path.dirname(linksFile), { recursive: true });
  fs.writeFileSync(
    linksFile,
    JSON.stringify(
      {
        tunnelUrl: currentTunnelUrl,
        expoUrl: currentExpoUrl,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function startExpo(apiBase: string): void {
  if (expoProc && expoStartedWithUrl === apiBase) return;
  if (expoProc) {
    expoProc.kill();
    expoProc = null;
  }
  expoStartedWithUrl = apiBase;
  const expoCli = path.join(mobileDir, 'node_modules', 'expo', 'bin', 'cli');
  console.log(`[expo] Başlatılıyor (API=${apiBase})...`);

  const proc = spawn(process.execPath, [expoCli, 'start', '--go', '--lan', '--port', '8081'], {
    cwd: mobileDir,
    env: {
      ...process.env,
      CI: '0',
      EXPO_NO_TELEMETRY: '1',
      EXPO_PUBLIC_API_URL: apiBase,
    },
    stdio: ['pipe', 'pipe', 'pipe'], // stdin açık tutulur (EOF'ta kapanmaması için)
  });
  expoProc = proc;

  const onData = (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    const m = text.match(/exp:\/\/[^\s)]+/);
    if (m && m[0] !== currentExpoUrl) {
      currentExpoUrl = m[0];
      saveLinks();
      console.log(`[expo] Hazır: ${currentExpoUrl}`);
    }
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() && (line.includes('exp://') || line.includes('Waiting on') || line.includes('Metro'))) {
        console.log(`[expo] ${line.trim()}`);
      }
    }
  };

  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);
  proc.on('exit', (code) => {
    console.log(`[expo] Kapandı (kod=${code})`);
  });
}

function startHttpsTunnel(): void {
  const sshBin = fs.existsSync('C:\\Windows\\System32\\OpenSSH\\ssh.exe')
    ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
    : 'ssh';

  console.log('[tunnel] HTTPS tüneli açılıyor (localhost:4000)...');
  const ssh = spawn(
    sshBin,
    [
      '-T',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=NUL',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=2',
      '-o',
      'ExitOnForwardFailure=yes',
      '-R',
      '80:127.0.0.1:4000',
      'nokey@localhost.run',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  const handleOutput = (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    const m = text.match(/https:\/\/[a-z0-9-]+\.lhr\.life/i);
    if (m && m[0] !== currentTunnelUrl) {
      currentTunnelUrl = m[0];
      saveLinks();
      console.log(`[tunnel] MOBİL KURULUM HTTPS ADRESİ: ${currentTunnelUrl}`);
      startExpo(`${currentTunnelUrl}/api`);
    }
  };

  ssh.stdout?.on('data', handleOutput);
  ssh.stderr?.on('data', handleOutput);

  ssh.on('exit', (code) => {
    console.warn(`[tunnel] Bağlantı koptu (kod=${code}), 5 sn içinde yeniden bağlanılıyor...`);
    currentTunnelUrl = null;
    saveLinks();
    setTimeout(startHttpsTunnel, 5000);
  });

  ssh.on('error', (err) => {
    console.warn(`[tunnel] SSH başlatılamadı: ${err.message}`);
  });
}

saveLinks();
startHttpsTunnel();
// Tünel 6 saniye içinde bağlanamazsa Expo'yu yerel IP ile başlat
setTimeout(() => {
  if (!expoProc) {
    startExpo(`http://${lanIp}:4000/api`);
  }
}, 6000);

process.on('SIGINT', () => {
  expoProc?.kill();
  process.exit(0);
});
