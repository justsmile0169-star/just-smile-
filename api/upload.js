export default async function handler(req, res) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const image = body?.image;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const base64Clean = image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const apiKey = '6d207e02198a847aa98d0a2a901485a5';

    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('action', 'upload');
    formData.append('source', base64Clean);
    formData.append('format', 'json');

    const response = await fetch('https://freeimage.host/api/1/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'FreeImage upload failed', details: errText });
    }

    const data = await response.json();
    const directUrl = data?.image?.display_url || data?.image?.url || data?.data?.url;

    if (directUrl && typeof directUrl === 'string') {
      return res.status(200).json({ success: true, url: directUrl });
    } else {
      return res.status(500).json({ error: 'No URL returned from FreeImage', raw: data });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err?.message || String(err) });
  }
}
