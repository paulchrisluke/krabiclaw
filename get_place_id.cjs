const https = require('https');
https.get('https://www.google.com/maps/place/Beachfront+Pottery+Krabi/@8.0574303,98.746036,17z/data=!4m15!1m8!3m7!1s0x3051bf001b03f635:0xafb40b8ba3d4f053!2sBeachfront+Pottery+Krabi!8m2!3d8.057425!4d98.7486163!10e1!16s%2Fg%2F11yfvr97vw!3m5!1s0x3051bf001b03f635:0xafb40b8ba3d4f053!8m2!3d8.057425!4d98.7486163!16s%2Fg%2F11yfvr97vw?entry=ttu&g_ep=EgoyMDI2MDUyNS4wIKXMDSoASAFQAw%3D%3D', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Extract ChIJ
    const match = data.match(/ChIJ[A-Za-z0-9_-]+/g);
    if (match) {
      console.log('Found Place IDs:', [...new Set(match)]);
    } else {
      console.log('No Place ID found');
    }
  });
});
