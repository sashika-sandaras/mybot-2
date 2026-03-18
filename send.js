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
                // 1. මුලින්ම Request එක ලැබුණු බව
                await sendMsg("✅ *Request Received...*");
                await delay(1000);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                const pyScript = `
import os, requests, gdown, re, sys
f_id = "${fileId}"
v_key = "${voeKey}"
is_gdrive = len(f_id) > 25 or (len(f_id) > 20 and any(c.isupper() for c in f_id))
try:
    if is_gdrive:
        url = f"https://drive.google.com/uc?id={f_id}"
        output = gdown.download(url, quiet=True, fuzzy=True)
    else:
        api_url = f"https://voe.sx/api/drive/v2/file/info?key={v_key}&file_code={f_id}"
        r = requests.get(api_url).json()
        direct_url = r['result']['direct_url']
        res = requests.get(direct_url, stream=True)
        cd = res.headers.get('content-disposition')
        output = re.findall('filename="?([^"]+)"?', cd)[0] if cd else 'file.mkv'
        with open(output, 'wb') as f:
            for chunk in res.iter_content(1024*1024): f.write(chunk)
    print(output)
except Exception:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);
                const fileName = execSync('python3 downloader.py').toString().trim();

                if (!fileName || !fs.existsSync(fileName)) throw new Error("File not found");

                // 2. Upload වෙමින් පවතී මැසේජ් එක
                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                const extension = path.extname(fileName).toLowerCase();
                let isSub = ['.srt', '.vtt', '.ass'].includes(extension);
                let mime = isSub ? 'text/plain' : (extension === '.mp4' ? 'video/mp4' : 'video/x-matroska');
                
                let successHeader = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                // 3. Document එකක් ලෙස යැවීම
                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `${successHeader}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                // 4. අවසාන පණිවිඩය
                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්...* 💝");
                
                // Cleanup
                fs.unlinkSync(fileName);
                fs.unlinkSync('downloader.py');
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                await sendMsg("❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*");
                process.exit(1);
            }
        }
    });
}

startBot();
