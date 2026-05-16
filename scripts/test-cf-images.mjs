import { fetch } from 'undici';

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CF_AIG_TOKEN;

async function main() {
  try {
    if (!ACCOUNT_ID || !TOKEN) {
      console.error('CF_ACCOUNT_ID or CF_AIG_TOKEN not set');
      process.exit(1);
    }

    console.log('Testing CF Images direct_upload...');
    const formData = new FormData();
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v2/direct_upload`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${TOKEN}`
      },
      body: formData
    });

    if (!res.ok) {
      console.error(`API error ${res.status}: ${await res.text()}`);
      process.exit(1);
    }

    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Execution failed:', error);
    process.exit(1);
  }
}

main();
