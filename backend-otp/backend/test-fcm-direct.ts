/**
 * FCM Direct Notification Tray Test
 * Bypasses HTTP API — uses admin.messaging().send() directly
 * Tests FOREGROUND, BACKGROUND, and KILLED states
 */
import dotenv from 'dotenv';
import path from 'path';
import admin from 'firebase-admin';
import { execSync } from 'child_process';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const ADB = `"${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe"`;
const ARTIFACT_DIR = `C:\\Users\\Anshika\\.gemini\\antigravity-ide\\brain\\bba884cb-e69c-4873-9ed1-227279eb49ed`;

// Real FCM token written to Firestore
const REAL_FCM_TOKEN = 'feyRuCFSQyCICYUqbmgvud:APA91bHCKzabnIje7fmghWV-KRMowkO3pp44Ayh7XLpItM32-oUouL91Af6bVitw9lI67uZDJrZGut0LD1lnVheFu65Xe6459A8cfAckjvWs3FaJ47dVKOE';
const RIDE_ID = `fcm_tray_test_${Date.now()}`;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function adb(args: string): string {
  try {
    return execSync(`${ADB} ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e: any) {
    return e.stderr || e.stdout || e.message || '';
  }
}

async function captureScreenshot(name: string): Promise<string> {
  const localPath = `${ARTIFACT_DIR}\\${name}.png`;
  try {
    const result = execSync(`${ADB} exec-out screencap -p`, { encoding: 'buffer' });
    require('fs').writeFileSync(localPath, result);
    console.log(`  📸 Screenshot saved: ${name}.png`);
    return localPath;
  } catch (e: any) {
    // fallback
    try {
      adb(`shell screencap -p /sdcard/${name}.png`);
      adb(`pull /sdcard/${name}.png "${localPath}"`);
      console.log(`  📸 Screenshot saved: ${name}.png (via pull)`);
    } catch (e2) { /* ignore */ }
    return localPath;
  }
}

async function sendFCM(label: string, notifBody: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log(`\n  📤 Dispatching FCM [${label}]...`);
  try {
    const messageId = await admin.messaging().send({
      token: REAL_FCM_TOKEN,
      notification: {
        title: `🔔 PullUp [${label}]`,
        body: notifBody,
      },
      data: {
        type: 'ride_started',
        rideId: RIDE_ID,
        bookingId: `bk_tray_${label}`,
        targetScreen: 'navigation',
        targetId: RIDE_ID,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default',
          notificationCount: 1,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    });
    console.log(`  ✅ FCM accepted! messageId: ${messageId}`);
    return { success: true, messageId };
  } catch (e: any) {
    console.log(`  ❌ FCM ERROR: ${e.code || e.message}`);
    return { success: false, error: e.code || e.message };
  }
}

async function getLogcatLines(seconds = 5): Promise<string> {
  await sleep(seconds * 1000);
  return adb(`logcat -d -t 200 *:S ReactNativeJS:V firebase:V FirebaseMessaging:V com.google.firebase:V`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     FCM NOTIFICATION TRAY TEST – 3 App States           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Token: ${REAL_FCM_TOKEN.substring(0, 25)}...`);
  console.log(`Ride ID: ${RIDE_ID}`);

  const results: Record<string, any> = {};

  // ─────────────────────────────────────────────────────────────
  // STATE 1: FOREGROUND
  // ─────────────────────────────────────────────────────────────
  console.log('\n\n┌──────────────────────────────────────────────┐');
  console.log('│  STATE 1: FOREGROUND                         │');
  console.log('└──────────────────────────────────────────────┘');
  adb('shell am start -n com.pullupapp/.MainActivity');
  console.log('  → Brought app to foreground. Waiting 3s...');
  await sleep(3000);
  await captureScreenshot('01_foreground_before');
  
  adb('logcat -c'); // clear logcat

  const fg = await sendFCM('FOREGROUND', 'App is open — you should see an in-app notification banner or system tray notification appear NOW.');
  results.FOREGROUND = fg;
  
  console.log('  ⏳ Waiting 5s for notification to render...');
  await sleep(5000);
  await captureScreenshot('02_foreground_after_notif');
  
  // Try to pull down notification shade for screenshot
  adb('shell input swipe 540 0 540 800 500');
  await sleep(1500);
  await captureScreenshot('03_foreground_shade');
  adb('shell input keyevent KEYCODE_BACK');

  // ─────────────────────────────────────────────────────────────
  // STATE 2: BACKGROUND
  // ─────────────────────────────────────────────────────────────
  console.log('\n\n┌──────────────────────────────────────────────┐');
  console.log('│  STATE 2: BACKGROUND                         │');
  console.log('└──────────────────────────────────────────────┘');
  adb('shell input keyevent KEYCODE_HOME');
  console.log('  → HOME key pressed. App in background. Waiting 2s...');
  await sleep(2000);
  await captureScreenshot('04_background_homescreen');
  
  adb('logcat -c');

  const bg = await sendFCM('BACKGROUND', 'App is backgrounded — this should appear in the system notification tray automatically.');
  results.BACKGROUND = bg;

  console.log('  ⏳ Waiting 8s for FCM to deliver tray notification...');
  await sleep(8000);

  // Pull down notification shade
  adb('shell input swipe 540 0 540 800 500');
  await sleep(2000);
  await captureScreenshot('05_background_shade_with_notif');
  
  // Check logcat for FCM delivery
  const bgLog = adb('logcat -d -t 100 *:S FirebaseMessaging:V com.google.firebase.iid:V');
  console.log('\n  Logcat (background):', bgLog.substring(0, 500));

  adb('shell input keyevent KEYCODE_BACK');
  await sleep(1000);

  // ─────────────────────────────────────────────────────────────
  // STATE 3: FORCE-STOPPED / KILLED
  // ─────────────────────────────────────────────────────────────
  console.log('\n\n┌──────────────────────────────────────────────┐');
  console.log('│  STATE 3: FORCE-STOPPED (KILLED)             │');
  console.log('└──────────────────────────────────────────────┘');
  // Clear existing notifications first
  adb('shell service call notification 1');
  
  adb('shell am force-stop com.pullupapp');
  console.log('  → Force-stopped com.pullupapp. Waiting 3s...');
  await sleep(3000);
  await captureScreenshot('06_killed_state_homescreen');

  adb('logcat -c');

  const killed = await sendFCM('KILLED', 'App is force-stopped — Android FCM service should still deliver this to the tray.');
  results.KILLED = killed;

  console.log('  ⏳ Waiting 10s for FCM to deliver to killed app...');
  await sleep(10000);

  // Pull down notification shade
  adb('shell input swipe 540 0 540 800 500');
  await sleep(2000);
  await captureScreenshot('07_killed_shade_with_notif');

  // Check if notification is visible by examining the notification list
  const notifDump = adb('shell dumpsys notification --noredact 2>&1 | grep -i pullup');
  console.log('\n  Notification dump (pullup):', notifDump.substring(0, 500) || 'No pullup entries found');

  // ─────────────────────────────────────────────────────────────
  // RESULTS SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║            FCM TRAY TEST RESULTS                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  for (const [state, result] of Object.entries(results)) {
    const icon = result.success ? '✅' : '❌';
    const detail = result.success ? `messageId=${result.messageId?.substring(0, 30)}...` : `error=${result.error}`;
    console.log(`  ${icon} ${state.padEnd(12)} | FCM_DISPATCH=${result.success ? 'PASS' : 'FAIL'} | ${detail}`);
  }

  console.log('\n📸 Screenshots saved to artifact dir for visual verification.');
  console.log('  01_foreground_before.png   – App before notification');
  console.log('  02_foreground_after_notif.png – App after FOREGROUND notification sent');
  console.log('  03_foreground_shade.png    – Notification shade FOREGROUND');
  console.log('  04_background_homescreen.png – Homescreen during BACKGROUND test');
  console.log('  05_background_shade_with_notif.png – Shade during BACKGROUND test');
  console.log('  06_killed_state_homescreen.png – After force-stop');
  console.log('  07_killed_shade_with_notif.png – Shade after KILLED state test');

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
