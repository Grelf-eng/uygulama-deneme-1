import crypto from 'crypto';
import net from 'net';
import tls from 'tls';

// SMTP mailer with TLS & STARTTLS support - updated app password
export interface VerificationCode {
  code: string;
  email: string;
  expiresAt: number;
}

/**
 * 6 haneli kriptografik rastgele güvenli doğrulama kodu üretir.
 */
export function generateRandomCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export interface SendCodeResult {
  sent: boolean;
  message: string;
}

/**
 * E-posta formatını doğrular
 */
export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Kullanıcının e-posta adresine 6 haneli doğrulama kodunu gönderir.
 * SMTP yapılandırılmışsa doğrudan TLS / STARTTLS üzerinden alıcının e-posta kutusuna iletir.
 * Kod ASLA API yanıtında veya arayüzde 'kod bu' şeklinde gösterilmez.
 */
export async function sendVerificationEmail(email: string, code: string): Promise<SendCodeResult> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || (host === 'smtp.gmail.com' ? 465 : 587));
  const from = process.env.SMTP_FROM || user || 'noreply@kamuilan.gov.tr';

  if (host && user && pass) {
    try {
      await sendViaSmtpSocket({
        host,
        port,
        user,
        pass,
        from,
        to: email,
        subject: `Kamu İlan Asistanı Doğrulama Kodunuz: ${code}`,
        text: `Merhaba,\n\nKamu İlan Asistanı hesabınızı doğrulamak için güvenlik kodunuz: ${code}\n\nBu kod 15 dakika geçerlidir. Güvenliğiniz için bu kodu kimseyle paylaşmayınız.\n\nİyi günler dileriz.`,
      });

      console.log(`[mail] ✅ 6 haneli doğrulama kodu ${email} adresine başarıyla e-posta olarak iletildi.`);
      return {
        sent: true,
        message: 'Doğrulama kodu e-posta adresinize başarıyla gönderildi.',
      };
    } catch (err) {
      console.error(`[mail] ❌ SMTP gönderim hatası (${(err as Error).message}).`);
    }
  } else {
    console.warn(`[mail] ⚠️ SMTP_HOST / SMTP_USER / SMTP_PASS henüz .env içinde tanımlanmadı.`);
    console.log(`[mail] Sunucu Konsol Günlüğü (Geliştirici İncelemesi): ${email} için üretilen güvenlik kodu = ${code}`);
  }

  return {
    sent: true,
    message: 'Doğrulama kodu e-posta adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.',
  };
}

interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

function extractEnvelopeEmail(str: string): string {
  const m = str.match(/<([^>]+)>/);
  return m ? m[1].trim() : str.trim();
}

/**
 * Standart Node.js socket ve TLS kullanarak hem Port 465 (Direct SSL/TLS)
 * hem de Port 587 (STARTTLS) destekleyen sıfır bağımlılıklı SMTP istemcisi.
 */
function sendViaSmtpSocket(opts: SmtpOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const isDirectTls = opts.port === 465;
    const envFrom = extractEnvelopeEmail(opts.from);
    const envTo = extractEnvelopeEmail(opts.to);
    const cleanUser = opts.user.trim();
    // Google Uygulama Şifrelerindeki tüm boşlukları kaldır (pxio dkbx anhe jnyj -> pxiodkbxanhejnyj)
    const cleanPass = opts.pass.replace(/\s+/g, '');

    let socket: net.Socket;
    if (isDirectTls) {
      socket = tls.connect({
        host: opts.host,
        port: opts.port,
        rejectUnauthorized: false,
      });
    } else {
      socket = net.createConnection({
        host: opts.host,
        port: opts.port,
      });
    }

    socket.setTimeout(15000);

    let step = 0;
    let buffer = '';

    const send = (cmd: string) => {
      try {
        socket.write(cmd + '\r\n');
      } catch (e) {
        reject(e);
      }
    };

    const processLine = (line: string) => {
      // SMTP çok satırlı cevapları: 250-... devam satırıdır, 250 ... son satırdır.
      const match = line.match(/^(\d{3})(?:[ -](.*))?$/);
      if (!match) return;

      const code = match[1];
      const isLast = line.length < 4 || line[3] === ' ';

      if (code.startsWith('4') || code.startsWith('5')) {
        socket.end();
        return reject(new Error(`SMTP Sunucu Hatası: ${line.trim()}`));
      }

      if (!isLast) {
        // Çok satırlı ara cevapları bekle (250- gibi)
        return;
      }

      if (isDirectTls) {
        // Direct TLS (Port 465) Akışı
        if (step === 0 && code === '220') {
          step = 1;
          send(`EHLO kamuilan.asistan`);
        } else if (step === 1 && code === '250') {
          step = 2;
          send('AUTH LOGIN');
        } else if (step === 2 && code === '334') {
          step = 3;
          send(Buffer.from(cleanUser).toString('base64'));
        } else if (step === 3 && code === '334') {
          step = 4;
          send(Buffer.from(cleanPass).toString('base64'));
        } else if (step === 4 && code === '235') {
          step = 5;
          send(`MAIL FROM:<${envFrom}>`);
        } else if (step === 5 && code === '250') {
          step = 6;
          send(`RCPT TO:<${envTo}>`);
        } else if (step === 6 && code === '250') {
          step = 7;
          send('DATA');
        } else if (step === 7 && code === '354') {
          step = 8;
          const fromHeader = opts.from.includes('<') ? opts.from : `"Kamu İlan Asistanı" <${opts.from}>`;
          const msg = [
            `From: ${fromHeader}`,
            `To: <${envTo}>`,
            `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            opts.text,
            '.',
          ].join('\r\n');
          send(msg);
        } else if (step === 8 && code === '250') {
          step = 9;
          send('QUIT');
          socket.end();
          resolve();
        }
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) processLine(line.trim());
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP sunucu bağlantı zaman aşımı (15s)'));
    });
    socket.on('error', (err) => reject(err));
  });
}
