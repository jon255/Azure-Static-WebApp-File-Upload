const busboy = require('busboy');
const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
  StorageSharedKeyCredential
} = require('@azure/storage-blob');
const { DocumentAnalysisClient, AzureKeyCredential } = require("@azure/ai-form-recognizer");

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

  // Upload to Blob Storage
  const blobConnectionString = process.env.BLOB_CONNECTION_STRING;
  const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnectionString);
  const containerClient = blobServiceClient.getContainerClient('uploads');
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(fileName);
  await blockBlobClient.uploadData(fileBuffer);
  context.log("File uploaded to Blob Storage");

  // Analyze with Azure Document Intelligence
  try {
    const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
    const apiKey = process.env.DOCUMENT_INTELLIGENCE_API_KEY;

    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
    const poller = await client.beginAnalyzeDocument("prebuilt-document", fileBuffer);
    const result = await poller.pollUntilDone();

    context.res = {
      status: 200,
      body: result
    };
  } catch (err) {
    context.log('AI processing error:', err);
    context.res = {
      status: 500,
      body: { error: 'Failed to process file with Document Intelligence', details: err.message }
    };
  }
};
