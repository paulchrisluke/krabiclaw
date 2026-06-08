import { fetch } from 'undici';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function main() {
  try {
    if (!TOKEN) {
      console.error('CLOUDFLARE_API_TOKEN not set');
      process.exit(1);
    }

    console.log('Verifying token...');
    const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) {
      console.error(`API error ${res.status}: ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Execution failed:', error);
    process.exit(1);
  }
}

main();
