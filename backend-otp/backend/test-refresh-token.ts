import http from 'http';

const postData = JSON.stringify({ userId: 'csvKsIOILhMtcSiQW8pD57rVijU2' });
const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/api/otp/refresh-custom-token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => console.log('RESPONSE:', res.statusCode, data.substring(0, 120) + '...'));
  }
);
req.write(postData);
req.end();
