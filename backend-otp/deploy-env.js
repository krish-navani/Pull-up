const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = path.join(__dirname, 'backend', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('No .env.local file found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split(/\r?\n/);

console.log('Starting Vercel Environment Variables Configuration...');

for (let line of lines) {
  line = line.trim();
  if (!line || line.startsWith('#')) continue;
  
  const equalsIndex = line.indexOf('=');
  if (equalsIndex === -1) continue;
  
  const key = line.substring(0, equalsIndex).trim();
  let val = line.substring(equalsIndex + 1).trim();
  
  // Strip quotes if present
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.substring(1, val.length - 1);
  }
  
  if (!val) {
    console.log(`Skipping empty variable: ${key}`);
    continue;
  }
  
  console.log(`Setting ${key} on Vercel...`);
  try {
    // 1. Remove the old environment variable (ignore error if it didn't exist)
    try {
      execSync(`npx vercel env rm ${key} production --yes`, { stdio: 'ignore' });
    } catch (e) {}
    
    // 2. Add the environment variable using stdin input option of execSync
    const cleanVal = val.replace(/\\n/g, '\n');
    execSync(`npx vercel env add ${key} production`, {
      input: cleanVal,
      stdio: ['pipe', 'ignore', 'inherit']
    });
    
    console.log(`Successfully set ${key}`);
  } catch (error) {
    console.error(`Failed to add ${key}:`, error.message);
  }
}

console.log('Environment variables configuration completed!');
