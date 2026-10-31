import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const sdkRoot = 'C:\\Users\\PC\\.gemini\\antigravity\\brain\\edbddfde-097f-49dc-981b-b504c58a45db\\scratch\\android-sdk';
const downloadsDir = path.join(sdkRoot, 'downloads');
const extractedDir = path.join(sdkRoot, 'extracted');

const projectRoot = path.resolve(__dirname, '..', '..');
const apkProjectDir = path.join(projectRoot, 'android-apk');
const buildDir = path.join(sdkRoot, 'build-work');

function findFile(dir: string, targetName: string): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, targetName);
      if (found) return found;
    }
  }
  return null;
}

function collectFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, ext));
    else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function run(bin: string, args: string[], label: string): string {
  console.log(`[apk] ${label}...`);
  return execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

fs.mkdirSync(extractedDir, { recursive: true });

for (const name of ['jdk17', 'build-tools', 'platform']) {
  const zipPath = path.join(downloadsDir, `${name}.zip`);
  const dest = path.join(extractedDir, name);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Eksik arşiv: ${zipPath}`);
  }
  if (!fs.existsSync(dest) || fs.readdirSync(dest).length === 0) {
    fs.mkdirSync(dest, { recursive: true });
    run('C:\\Windows\\System32\\tar.exe', ['-xf', zipPath, '-C', dest], `${name}.zip çıkartılıyor`);
  }
}

const javaExe = findFile(path.join(extractedDir, 'jdk17'), 'java.exe');
const javacExe = findFile(path.join(extractedDir, 'jdk17'), 'javac.exe');
const jarExe = findFile(path.join(extractedDir, 'jdk17'), 'jar.exe');
const keytoolExe = findFile(path.join(extractedDir, 'jdk17'), 'keytool.exe');
const aapt2Exe = findFile(path.join(extractedDir, 'build-tools'), 'aapt2.exe');
const zipalignExe = findFile(path.join(extractedDir, 'build-tools'), 'zipalign.exe');
const d8Jar = findFile(path.join(extractedDir, 'build-tools'), 'd8.jar');
const apksignerJar = findFile(path.join(extractedDir, 'build-tools'), 'apksigner.jar');
const androidJar = findFile(path.join(extractedDir, 'platform'), 'android.jar');

for (const [k, v] of Object.entries({ javaExe, javacExe, jarExe, keytoolExe, aapt2Exe, zipalignExe, d8Jar, apksignerJar, androidJar })) {
  if (!v) throw new Error(`SDK aracı bulunamadı: ${k}`);
}

fs.rmSync(buildDir, { recursive: true, force: true });
const genDir = path.join(buildDir, 'gen');
const classesDir = path.join(buildDir, 'classes');
const dexDir = path.join(buildDir, 'dex');
fs.mkdirSync(genDir, { recursive: true });
fs.mkdirSync(classesDir, { recursive: true });
fs.mkdirSync(dexDir, { recursive: true });

const compiledResZip = path.join(buildDir, 'compiled_res.zip');
const unalignedApk = path.join(buildDir, 'unaligned.apk');
const alignedApk = path.join(buildDir, 'aligned.apk');
const keystorePath = path.join(sdkRoot, 'kamuilan-release.keystore');
const finalRootApk = path.join(projectRoot, 'kamu-ilan-asistani.apk');
const finalPublicApk = path.join(projectRoot, 'backend', 'public', 'kamu-ilan-asistani.apk');

// 1) Kaynakları derle (aapt2 compile)
run(aapt2Exe!, ['compile', '--dir', path.join(apkProjectDir, 'res'), '-o', compiledResZip], 'Android kaynakları derleniyor (aapt2 compile)');

// 2) APK iskeletini ve R.java'yı oluştur (aapt2 link)
// Not: Windows'ta aapt2 -A ters eğik çizgi (\) kullandığından assets klasörü jar.exe ile POSIX (/) olarak eklenir.
run(
  aapt2Exe!,
  [
    'link',
    '-o',
    unalignedApk,
    '-I',
    androidJar!,
    '--manifest',
    path.join(apkProjectDir, 'AndroidManifest.xml'),
    '--java',
    genDir,
    compiledResZip,
    '--auto-add-overlay',
  ],
  'APK paketleniyor (aapt2 link)',
);

// 3) Java kaynaklarını derle (javac)
const javaSources = [
  ...collectFiles(path.join(apkProjectDir, 'src'), '.java'),
  ...collectFiles(genDir, '.java'),
];
run(
  javacExe!,
  ['-encoding', 'UTF-8', '--release', '11', '-cp', androidJar!, '-d', classesDir, ...javaSources],
  `Java sınıfları derleniyor (${javaSources.length} dosya)`,
);

// 4) Dalvik/ART bytecode üret (d8 -> classes.dex)
const classFiles = collectFiles(classesDir, '.class');
run(
  javaExe!,
  ['-cp', d8Jar!, 'com.android.tools.r8.D8', '--min-api', '24', '--lib', androidJar!, '--output', dexDir, ...classFiles],
  `DEX derleniyor (${classFiles.length} class)`,
);

// 5) classes.dex ve assets/ dosyalarını POSIX (/) yol ayırıcılarıyla APK içine ekle
run(jarExe!, ['uf', unalignedApk, '-C', dexDir, 'classes.dex', '-C', apkProjectDir, 'assets'], 'classes.dex ve assets APK içine ekleniyor');

// 6) 4-byte / sayfa hizalaması (zipalign)
run(zipalignExe!, ['-p', '-f', '4', unalignedApk, alignedApk], 'APK hizalanıyor (zipalign)');

// 7) İmza anahtarı oluştur ve V1+V2+V3 imzala (apksigner)
if (!fs.existsSync(keystorePath)) {
  run(
    keytoolExe!,
    [
      '-genkeypair',
      '-keystore',
      keystorePath,
      '-alias',
      'kamuilan',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-storepass',
      'kamuilan123',
      '-keypass',
      'kamuilan123',
      '-dname',
      'CN=Kamu Ilan Asistani, O=KamuIlan, C=TR',
    ],
    'İmza sertifikası oluşturuluyor (keytool)',
  );
}

run(
  javaExe!,
  [
    '-jar',
    apksignerJar!,
    'sign',
    '--ks',
    keystorePath,
    '--ks-key-alias',
    'kamuilan',
    '--ks-pass',
    'pass:kamuilan123',
    '--key-pass',
    'pass:kamuilan123',
    '--min-sdk-version',
    '21',
    '--v1-signing-enabled',
    'true',
    '--v2-signing-enabled',
    'true',
    '--v3-signing-enabled',
    'true',
    '--out',
    finalRootApk,
    alignedApk,
  ],
  'APK imzalanıyor (apksigner V1+V2+V3)',
);

const verifyOut = run(javaExe!, ['-jar', apksignerJar!, 'verify', '--verbose', finalRootApk], 'APK imzası doğrulanıyor');
console.log(verifyOut.trim());

fs.copyFileSync(finalRootApk, finalPublicApk);
const sizeKb = Math.round(fs.statSync(finalRootApk).size / 1024);
console.log(`✅ APK BAŞARIYLA OLUŞTURULDU: ${finalRootApk} (${sizeKb} KB)`);
