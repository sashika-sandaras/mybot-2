const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID;
    const voeKey = process.env.VOE_KEY;

    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Sync Error"); }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ["MFlix-Engine", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    async function sendMsg(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                await sendMsg("✅ *Request Received...*");
                await delay(1000);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                const pyScript = `
import os, requests, re, sys, subprocess, base64

f_id = "${fileId}"
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"

try:
    if len(f_id) > 25:
        import gdown
        url = f"https://drive.google.com/uc?id={f_id}"
        name = gdown.download(url, quiet=True, fuzzy=True)
        print(name)
    else:
        # VOE Page එකට ගොස් වීඩියෝ ලින්ක් එක සෙවීම (Scraping)
        page_url = f"https://voe.sx/{f_id}"
        response = requests.get(page_url, headers={"User-Agent": ua}, timeout=15)
        html = response.text
        
        # 'hls': '...' හෝ 'mp4': '...' ලින්ක් එක සෙවීම
        match = re.search(r"'hls':\\s*'([^']+)'", html) or re.search(r"'mp4':\\s*'([^']+)'", html)
        
        if not match:
            # තවත් ක්‍රමයක්: Base64 decode කර බැලීම
            b64_match = re.search(r"sources\\[0\\]\\[\\s*'file'\\s*\\]\\s*=\\s*atob\\('([^']+)'\\)", html)
            if b64_match:
                d_url = base64.b64decode(b64_match.group(1)).decode('utf-8')
            else:
                sys.stderr.write("Could not find video link on page")
                sys.exit(1)
        else:
            d_url = match.group(1)

        name = "video.mp4" # නම වෙනස් කර ගත හැක
        
        cmd = f'curl -L -k -s -A "{ua}" -o "{name}" "{d_url}"'
        res = subprocess.call(cmd, shell=True)
        
        if res == 0 and os.path.exists(name):
            print(name)
        else:
            sys.stderr.write("Curl failed to download from scraped link")
            sys.exit(1)
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);

                let fileName;
                try {
                    fileName = execSync('python3 downloader.py').toString().trim();
                } catch (pyErr) {
                    let errorMsg = pyErr.stderr.toString() || "Unknown Scraping Error";
                    await sendMsg("❌ *දෝෂය:* " + errorMsg);
                    throw pyErr;
                }

                if (!fileName || !fs.existsSync(fileName)) throw new Error("File missing");

                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                const ext = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                const mime = isSub ? 'text/plain' : (ext === '.mp4' ? 'video/mp4' : 'video/x-matroska');
                const header = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `${header}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්...* 💝");
                
                fs.unlinkSync(fileName);
                fs.unlinkSync('downloader.py');
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                process.exit(1);
            }
        }
    });
}

startBot();
