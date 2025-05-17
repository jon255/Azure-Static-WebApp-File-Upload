const busboy = require('busboy');
const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol, StorageSharedKeyCredential } = require('@azure/storage-blob');
const axios = require('axios');

module.exports = async function (context, req) {
  const bb = busboy({ headers: req.headers });

  let fileBuffer = Buffer.alloc(0);
  let fileName = 'unknown';

  await new Promise((resolve, reject) => {
    bb.on('file', (name, file, info) => {
      fileName = info.filename;
      file.on('data', data => { fileBuffer = Buffer.concat([fileBuffer, data]); });
      file.on('end', () => context.log(`File [${fileName}] upload complete`));
    });

    bb.on('finish', resolve);
    bb.on('error', reject);
    bb.end(req.body);
  });

  const blobConnectionString = process.env.BLOB_CONNECTION_STRING;
  const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnectionString);
  const containerClient = blobServiceClient.getContainerClient('uploads');

  const blockBlobClient = containerClient.getBlockBlobClient(fileName);
  await blockBlobClient.uploadData(fileBuffer);

  // Create SAS URL
  const accountName = "<your-storage-account-name>";
  const accountKey = "<your-storage-account-key>";  // Add to config as STORAGE_KEY
  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

  const sasToken = generateBlobSASQueryParameters({
    containerName: 'uploads',
    blobName: fileName,
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(new Date().valueOf() + 3600 * 1000),
    protocol: SASProtocol.Https
  }, sharedKeyCredential).toString();

  const fileUrl = `${blockBlobClient.url}?${sasToken}`;
  context.log(`File URL: ${fileUrl}`);

  // Call Document Intelligence
  try {
    const endpoint = process.env.FORM_RECOGNIZER_ENDPOINT;
    const key = process.env.FORM_RECOGNIZER_KEY;

    const response = await axios.post(
      `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`,
      { urlSource: fileUrl },
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/json'
        }
      }
    );

    const resultUrl = response.headers['operation-location'];

    // Poll the result
    let result = null;
    for (let i = 0; i < 10; i++) {
      const poll = await axios.get(resultUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': key }
      });

      if (poll.data.status === 'succeeded') {
        result = poll.data.analyzeResult;
        break;
      } else if (poll.data.status === 'failed') {
        throw new Error("Document analysis failed");
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    context.res = {
      status: 200,
      body: result
    };

  } catch (err) {
    context.log('AI processing error:', err);
    context.res = {
      status: 500,
      body: { error: 'Failed to process file with Document Intelligence' }
    };
  }
};
