const busboy = require('busboy');
const { BlobServiceClient } = require('@azure/storage-blob');

module.exports = async function (context, req) {
  const bb = busboy({ headers: req.headers });
  let fileBuffer = Buffer.alloc(0);
  let fileName = req.query.filename || 'uploaded-file';

  await new Promise((resolve, reject) => {
    bb.on('file', (name, file) => {
      file.on('data', (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
    });
    bb.on('finish', resolve);
    bb.end(req.body);
  });

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.BLOB_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient('uploads');
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.uploadData(fileBuffer);

    context.res = {
      status: 200,
      body: { message: 'File uploaded successfully', fileName }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: 'Upload failed', details: err.message }
    };
  }
};
