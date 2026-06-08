import { fetch } from 'undici';

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN;

async function main() {
  try {
    if (!ACCOUNT_ID) {
      console.error('CF_ACCOUNT_ID not set');
      process.exit(1);
    }
    if (!TOKEN) {
      console.error('CLOUDFLARE_IMAGES_API_TOKEN not set');
      process.exit(1);
    }

    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (!res.ok) {
      console.error(`API error ${res.status}: ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    const images = data?.result?.images || [];
    
    if (images.length === 0) {
      console.log('No images found in account.');
      process.exit(0);
    }

    const firstImage = images[0];
    const variants = firstImage.variants || [];
    if (variants.length > 0) {
      const match = variants[0].match(/imagedelivery\.net\/([^/]+)\//);
      if (match) {
        console.log(`FOUND_HASH: ${match[1]}`);
      } else {
        console.log('Could not parse hash from variant URL:', variants[0]);
      }
    } else {
      console.log('No variants found for first image.');
    }
  } catch (err) {
    console.error('Error fetching images:', err);
    process.exit(1);
  }
}

main();
