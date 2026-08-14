const fetch = require('node-fetch'); // Depending on node version, might be native. If node 18+, fetch is native.

async function testNotif() {
    try {
        // 1. Login to get a token
        console.log("Logging in...");
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'E Valencia', password: '123' }) // Assuming default or common test pass, or we can just use another user.
        });
        
        const loginData = await loginRes.json();
        if (!loginRes.ok) {
            console.error("Login failed:", loginData);
            return;
        }
        
        console.log("Login successful, token:", loginData.token.substring(0, 10) + '...');
        
        // 2. Insert notification
        console.log("Sending notification to E Valencia...");
        const notifRes = await fetch('http://localhost:3000/api/db/notificaciones', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${loginData.token}`
            },
            body: JSON.stringify({ 
                user_id: 'E Valencia', 
                mensaje: 'TESTING EMAIL NOTIFICATION', 
                link: { view: 'dashboard' }, 
                leido: false 
            })
        });
        
        const notifData = await notifRes.json();
        console.log("Notif response:", notifRes.status, notifData);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testNotif();
