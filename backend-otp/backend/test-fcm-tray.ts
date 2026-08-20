/**
 * FCM Notification Tray Test Script
 * Tests FOREGROUND, BACKGROUND, and KILLED states
 * Uses real backend endpoint to trigger FCM via admin SDK (direct FCM, no adb deep links)
 */
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import admin from 'firebase-admin';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const USER_ID = 'csvKsIOILhMtcSiQW8pD57rVijU2';
const BACKEND_PORT = 3000;
const RIDE_ID = `ride_fcm_test_${Date.now()}`;

function postJson(path: string, body: any): Promise<{ statusCode: number; data: any }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: BACKEND_PORT,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ statusCode: res.statusCode || 500, data: JSON.parse(data) }); }
        catch (e) { resolve({ statusCode: res.statusCode || 500, data }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function sendTestNotification(label: string, type = 'ride_started') {
  console.log(`\n📤 Sending [${label}] notification via backend...`);
  const res = await postJson('/api/otp/send-notification', {
    userId: USER_ID,
    type,
    title: `🔔 PullUp Test [${label}]`,
    message: `FCM tray test – state: ${label}. You should see this in system notification shade.`,
    rideId: RIDE_ID,
    bookingId: `bk_${label}_${Date.now()}`,
    targetScreen: 'navigation',
    targetId: RIDE_ID,
  });

  if (res.statusCode === 200 && res.data?.success !== false) {
    console.log(`  ✅ Backend accepted notification. pushSent=${res.data?.pushSent}`);
    return { pass: res.data?.pushSent === true, data: res.data };
  } else {
    console.log(`  ❌ Backend error: ${JSON.stringify(res.data)}`);
    return { pass: false, data: res.data };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('FCM NOTIFICATION TRAY TEST – 3 States');
  console.log('='.repeat(60));
  console.log(`User: ${USER_ID}`);
  console.log(`Ride ID: ${RIDE_ID}`);

  // ── FOREGROUND TEST ──────────────────────────────────────────
  console.log('\n\n--- [1] FOREGROUND STATE TEST ---');
  console.log('App should be OPEN and VISIBLE on emulator now.');
  console.log('FCM foreground handler fires → expo-notifications scheduleNotificationAsync → tray banner.');
  await sleep(2000);
  const fg = await sendTestNotification('FOREGROUND', 'ride_started');
  console.log('\nWaiting 5s for notification to appear in tray...');
  await sleep(5000);

  // ── BACKGROUND TEST ──────────────────────────────────────────
  console.log('\n\n--- [2] BACKGROUND STATE TEST ---');
  console.log('Pressing HOME button to send app to background...');
  await sleep(1000);

  // Send to background via adb keyevent HOME
  const { execSync } = require('child_process');
  try {
    execSync(`"${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe" shell input keyevent KEYCODE_HOME`);
    console.log('  → App backgrounded via HOME key');
  } catch (e: any) { console.log('  ⚠ Could not send HOME:', e.message); }

  await sleep(2000);
  const bg = await sendTestNotification('BACKGROUND', 'booking_accepted');
  console.log('\nWaiting 8s for tray notification...');
  await sleep(8000);

  // ── KILLED / FORCE-STOP TEST ─────────────────────────────────
  console.log('\n\n--- [3] KILLED/FORCE-STOP STATE TEST ---');
  console.log('Force-stopping com.pullupapp...');
  try {
    execSync(`"${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe" shell am force-stop com.pullupapp`);
    console.log('  → App force-stopped');
  } catch (e: any) { console.log('  ⚠ Could not force-stop:', e.message); }

  await sleep(3000);
  const killed = await sendTestNotification('KILLED', 'booking_request');
  console.log('\nWaiting 10s for tray notification...');
  await sleep(10000);

  // ── RESULT SUMMARY ───────────────────────────────────────────
  console.log('\n\n' + '='.repeat(60));
  console.log('FCM BACKEND DISPATCH RESULTS');
  console.log('='.repeat(60));
  console.log(`FOREGROUND BACKEND SEND: ${fg.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`BACKGROUND BACKEND SEND: ${bg.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`KILLED BACKEND SEND:     ${killed.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('');
  console.log('NOTE: "BACKEND SEND=PASS" means FCM accepted the message via admin.messaging().send().');
  console.log('Visual tray verification is done by screenshot below.');

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
