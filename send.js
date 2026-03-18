const { default: makeWASocket, useMultiFileAuthState, delay, disconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');

async function startBot() {
    // --- Session Setup (Gifted-Tech පන්නයට) ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    
    // GitHub Environments වල තියෙන SESSION_ID එක ගමු
    const sessionData = process.env.SESSION_ID;
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
            console.log("✅ Session Loaded Successfully!");
        } catch (e) {
            console.log("❌ Session Decode Error:", e.message);
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    // --- මැසේජ් එකක් ආවම ක්‍රියාත්මක වන කොටස ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // .tv [ID] command එක පරීක්ෂා කිරීම
        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];
            
            if (!fileId) {
                return await sock.sendMessage(from, { text: "⚠️ කරුණාකර Movie ID එකක් ලබා දෙන්න. \n\nඋදා: `.tv 12345`" });
            }

            await sock.sendMessage(from, { text: "⏳ ඔබගේ ඉල්ලීම පද්ධතියට ලැබුණා. කරුණාකර රැඳී සිටින්න..." });

            // ⚠️ මෙතනට ඔයාගේ අලුත්ම Google Script Web App URL එක දාන්න
            const scriptUrl = "https://script.google.com/macros/s/AKfycbwNpeqtAn7AoIqdZN2Unp-ZC9yME3ZUljoFEh7Oj-1Ej-kWwHvJPOpUGBTPTVAT7AtF/exec";

            try {
                // කෙලින්ම Google Sheet එකට දත්ත යැවීම
                await axios.post(scriptUrl, {
                    fileId: fileId,
                    userJid: from
                });

                await sock.sendMessage(from, { text: "✅ සාර්ථකයි! වීඩියෝව ස්වයංක්‍රීයව එවනු ඇත." });
                console.log(`🚀 Request Sent for ID: ${fileId}`);

            } catch (error) {
                console.error("❌ Google Sheet Error:", error.message);
                await sock.sendMessage(from, { text: "⚠️ පද්ධතියේ දෝෂයක්. පසුව උත්සාහ කරන්න." });
            }
        }
    });

    // Connection එක විසන්ධි වුණොත් ආයේ Connect වීම
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== disconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot is Online!');
        }
    });
}

// Bot එක ආරම්භ කිරීම
startBot();
