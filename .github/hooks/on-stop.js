const fs = require('fs');
const http = require('http');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
    try {
        const payload = JSON.parse(input);
        if (payload.transcript_path && fs.existsSync(payload.transcript_path)) {
            const transcriptRaw = fs.readFileSync(payload.transcript_path, 'utf8');
            const lines = transcriptRaw.split('\n').filter(line => line.trim().length > 0);
            const transcriptData = lines.map(line => {
                try { return JSON.parse(line); } catch (e) { return { error: 'Parse Error', raw: line }; }
            });
            const postData = JSON.stringify({ sessionId: payload.session_id, transcript: transcriptData });
            const req = http.request({
                hostname: '127.0.0.1', port: 54321, path: '/webhook-stop', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
            }, (res) => {
                console.log(JSON.stringify({ continue: true })); process.exit(0);
            });
            req.on('error', (e) => {
                console.log(JSON.stringify({ continue: true, systemMessage: e.message })); process.exit(0);
            });
            req.write(postData); req.end();
            return;
        }
    } catch (e) {}
    console.log(JSON.stringify({ continue: true })); process.exit(0);
});
