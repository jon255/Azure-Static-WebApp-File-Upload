const busboy = require('busboy');

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = {
      status: 405,
      body: { error: 'Method not allowed' },
    };
    return;
  }

  if (!req.headers['content-type'].startsWith('multipart/form-data')) {
    context.res = {
      status: 400,
      body: { error: 'Content-Type must be multipart/form-data' },
    };
    return;
  }

  const bb = busboy({ headers: req.headers });
  let fileBuffer = Buffer.alloc(0);
  let fileName = 'unknown';

  await new Promise((resolve, reject) => {
    bb.on('file', (name, file, info) => {
      fileName = info.filename;

      file.on('data', (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });

      file.on('end', () => {
        context.log(`File [${fileName}] upload complete`);
      });
    });

    bb.on('finish', resolve);
    bb.on('error', reject);

    bb.end(req.body);
  });

  // Placeholder for AI processing
  const fileSizeKB = (fileBuffer.length / 1024).toFixed(2);

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      message: `Received file '${fileName}'`,
      size_kb: fileSizeKB,
    },
  };
};
