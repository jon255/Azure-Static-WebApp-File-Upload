const busboy = require('busboy');
const { BlobServiceClient } = require('@azure/storage-blob');

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = { status: 405, body: 'Method Not Allowed' };
    return;
  }

  if (!req.headers['content-type'].startsWith('multipart/form-data')) {
    context.res = { status: 400, body: 'Expected multipart/form-data' };
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
        context.log(`Received file: ${fileName}`);
      });
    });

    bb.on('finish', resolve);
    bb.on('error', reject);
    bb.end(req.body);
  });

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AzureWebJobsStorage);
    const containerClient = blobServiceClient.getContainerClient('uploads'); // use your container name here

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.uploadData(fileBuffer);

    context.res = {
      status: 200,
      body: { message: `File '${fileName}' uploaded to Azure Blob Storage.` }
    };
  } catch (err) {
    context.log('Upload error:', err);
    context.res = {
      status: 500,
      body: { error: 'Failed to upload file to blob storage.' }
    };
  }
};
