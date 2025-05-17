const { BlobServiceClient } = require('@azure/storage-blob');
const axios = require('axios');

module.exports = async function (context, req) {
  const file = req.body;
  const fileName = req.query.filename;

  if (!file || !fileName) {
    context.res = { status: 400, body: 'Missing file or filename' };
    return;
  }

  // Upload to Azure Blob Storage
  const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.BLOB_CONNECTION_STRING);
  const containerClient = blobServiceClient.getContainerClient('uploads');
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(fileName);
  await blockBlobClient.upload(file, file.length);

  const blobUrl = blockBlobClient.url;

  // Send to Azure Document Intelligence
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  const aiRes = await axios.post(
    `${endpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`,
    { urlSource: blobUrl },
    {
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/json'
      }
    }
  );

  const operationLocation = aiRes.headers['operation-location'];

  // Wait for completion
  let result = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await axios.get(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': key }
    });

    if (statusRes.data.status === 'succeeded') {
      result = statusRes.data;
      break;
    }
  }

  if (!result) {
    context.res = { status: 500, body: 'Document analysis failed or timed out' };
    return;
  }

  context.res = {
    status: 200,
    body: result
  };
};
