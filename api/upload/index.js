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
      file.on('data', data => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
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

  // Generate SAS URL
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY;
  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

  const sasToken = generateBlobSASQueryParameters({
    containerName: 'uploads',
    blobName: fileName,
    permissions: BlobSASPermissions.parse("r"),
    expiresOn: new Date(Date.now() + 60 * 60 * 1000),
    protocol: SASProtocol.Https
  }, sharedKeyCredential).toString();

  const fileUrl = `${blockBlobClient.url}?${sasToken}`;
  context.log(`File URL: ${fileUrl}`);

  try {
    const endpoint = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
    const apiKey = process.env.DOCUMENT_INTELLIGENCE_API_KEY;

    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
    const poller = await client.beginAnalyzeDocumentFromUrl("prebuilt-document", fileUrl);
    const result = await poller.pollUntilDone();

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: result
    };

  } catch (err) {
    context.log('AI processing error:', err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: {
        error: 'Failed to process file with Document Intelligence',
        details: err.message
      }
    };
  }
};
