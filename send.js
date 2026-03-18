const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID; // මෙතනට Google Drive ID එක හෝ GitHub Raw Link එක දෙන්න

    // --- Auth Setup ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Error"); }
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

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                await sock.sendMessage(userJid, { text: "✅ *Request Received...*" });
                await delay(500);

                let finalFile = "";

                // --- GitHub ද නැත්නම් Google Drive ද කියා පරීක්ෂා කිරීම ---
                if (fileId.includes("githubusercontent.com") || fileId.includes("github.com")) {
                    await sock.sendMessage(userJid, { text: "📥 *GitHub Subtitle එක බාගත වෙමින් පවතී...*" });
                    
                    // GitHub Link එක Raw එකක් බවට පත් කිරීම (අවශ්‍ය නම්)
                    let rawUrl = fileId.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
                    
                    // URL එකෙන් ෆයිල් එකේ නම වෙන් කර ගැනීම
                    finalFile = rawUrl.split('/').pop();
                    
                    // Curl හරහා බාගැනීම
                    execSync(`curl -L "${rawUrl}" -o "${finalFile}"`);
                } 
                else {
                    // Google Drive Logic
                    await sock.sendMessage(userJid, { text: "📥 *Google Drive ගොනුව බාගත වෙමින් පවතී...*" });
                    execSync(`gdown --fuzzy https://drive.google.com/uc?id=${fileId}`);
                    
                    // බාගත වුණු ෆයිල් එකේ නම සෙවීම
                    const files = fs.readdirSync('.');
                    finalFile = files.find(f => 
                        !['send.js', 'package.json', 'package-lock.json', 'node_modules', 'auth_info', '.github'].includes(f) && 
                        !fs.lstatSync(f).isDirectory()
                    );
                }

                if (!finalFile || !fs.existsSync(finalFile)) throw new Error("DL_FAILED");

                await sock.sendMessage(userJid, { text: "📤 *WhatsApp වෙත Upload වෙමින් පවතී...*" });

                const ext = path.extname(finalFile).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                const caption = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                // Document එකක් ලෙස යැවීම
                await sock.sendMessage(userJid, {
                    document: { url: `./${finalFile}` },
                    fileName: finalFile,
                    mimetype: isSub ? "text/plain" : "application/octet-stream",
                    caption: `${caption}\n\n📦 *File :* ${finalFile}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                await sock.sendMessage(userJid, { text: "☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්!*" });

                if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                await sock.sendMessage(userJid, { text: "❌ *බාගත කිරීමේ හෝ යැවීමේ දෝෂයක්!*" });
                process.exit(1);
            }
        }
    });
}

startBot();
